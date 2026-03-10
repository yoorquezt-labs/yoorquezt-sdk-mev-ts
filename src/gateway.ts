import WebSocket from 'ws';
import {
  Auction,
  Bundle,
  BundleStatus,
  GatewayClientConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  MEVEvent,
  MempoolSnapshot,
  OFAStats,
  ProfitHistory,
  RelayStats,
  SimulationResult,
} from './types';
import { QMEVError } from './errors';

/**
 * MEVGatewayClient communicates with the MEV Gateway using JSON-RPC
 * over HTTP and WebSocket for subscriptions.
 */
export class MEVGatewayClient {
  private readonly url: string;
  private readonly apiKey?: string;
  private nextId = 1;
  private ws: WebSocket | null = null;
  private subscriptionHandlers = new Map<string, (event: MEVEvent) => void>();
  private pendingCalls = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private reconnecting = false;

  constructor(config: GatewayClientConfig) {
    this.url = config.url.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  // --- Bundle operations ---

  async submitBundle(bundle: Bundle): Promise<string> {
    return this.call<string>('mev_submitBundle', [bundle]);
  }

  async getBundleStatus(bundleId: string): Promise<BundleStatus> {
    return this.call<BundleStatus>('mev_getBundleStatus', [bundleId]);
  }

  async simulateBundle(bundle: Bundle): Promise<SimulationResult> {
    return this.call<SimulationResult>('mev_simulateBundle', [bundle]);
  }

  // --- Auction ---

  async getAuction(blockNumber?: number): Promise<Auction> {
    const params = blockNumber !== undefined ? [blockNumber] : [];
    return this.call<Auction>('mev_getAuction', params);
  }

  // --- Mempool ---

  async getMempoolSnapshot(): Promise<MempoolSnapshot> {
    return this.call<MempoolSnapshot>('mev_getMempoolSnapshot');
  }

  // --- Relay ---

  async getRelayStats(relayId?: string): Promise<RelayStats[]> {
    const params = relayId ? [relayId] : [];
    return this.call<RelayStats[]>('mev_getRelayStats', params);
  }

  // --- OFA ---

  async getOFAStats(timeRange?: string): Promise<OFAStats> {
    const params = timeRange ? [timeRange] : [];
    return this.call<OFAStats>('mev_getOFAStats', params);
  }

  // --- Analytics ---

  async getProfitHistory(
    timeRange?: string,
    strategy?: string,
  ): Promise<ProfitHistory> {
    const params: unknown[] = [];
    if (timeRange) params.push(timeRange);
    if (strategy) params.push(strategy);
    return this.call<ProfitHistory>('mev_getProfitHistory', params);
  }

  // --- WebSocket subscriptions ---

  /**
   * Subscribe to MEV event topics over WebSocket.
   * Returns an unsubscribe function.
   */
  subscribe(
    topics: string[],
    onEvent: (event: MEVEvent) => void,
  ): () => void {
    this.ensureWebSocket();

    const subscriptionId = `sub_${this.nextId++}`;
    this.subscriptionHandlers.set(subscriptionId, onEvent);

    // Send subscribe request once connected
    const sendSubscribe = () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const request: JsonRpcRequest = {
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'mev_subscribe',
          params: [{ topics, subscriptionId }],
        };
        this.ws.send(JSON.stringify(request));
      }
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      sendSubscribe();
    } else {
      this.ws?.once('open', sendSubscribe);
    }

    return () => {
      this.subscriptionHandlers.delete(subscriptionId);
      if (this.ws?.readyState === WebSocket.OPEN) {
        const request: JsonRpcRequest = {
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'mev_unsubscribe',
          params: [subscriptionId],
        };
        this.ws.send(JSON.stringify(request));
      }
    };
  }

  // --- Raw JSON-RPC ---

  async call<T>(method: string, params?: unknown[]): Promise<T> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params ?? [],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
    } catch (err) {
      throw QMEVError.networkError(err);
    }

    if (!response.ok) {
      throw new QMEVError(
        'HTTP_ERROR',
        `Gateway request failed: ${response.status}`,
      );
    }

    const rpcResponse = (await response.json()) as JsonRpcResponse<T>;

    if (rpcResponse.error) {
      throw QMEVError.fromJsonRpcError(rpcResponse.error);
    }

    return rpcResponse.result as T;
  }

  /**
   * Close all connections.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.subscriptionHandlers.clear();
    for (const [, pending] of this.pendingCalls) {
      pending.reject(
        new QMEVError('WS_DISCONNECTED', 'Client disconnected'),
      );
    }
    this.pendingCalls.clear();
  }

  // --- Internal ---

  private ensureWebSocket(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

    const wsUrl = this.url.replace(/^http/, 'ws');
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    this.ws = new WebSocket(wsUrl, { headers });

    this.ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Handle subscription notifications
        if (msg.method === 'mev_subscription' && msg.params) {
          const subId = msg.params.subscriptionId as string;
          const handler = this.subscriptionHandlers.get(subId);
          if (handler) {
            handler(msg.params.event as MEVEvent);
          }
          return;
        }

        // Handle RPC responses
        if (msg.id !== undefined) {
          const pending = this.pendingCalls.get(msg.id);
          if (pending) {
            this.pendingCalls.delete(msg.id);
            if (msg.error) {
              pending.reject(QMEVError.fromJsonRpcError(msg.error));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      if (this.subscriptionHandlers.size > 0 && !this.reconnecting) {
        this.reconnecting = true;
        setTimeout(() => {
          this.reconnecting = false;
          if (this.subscriptionHandlers.size > 0) {
            this.ensureWebSocket();
          }
        }, 3000);
      }
    });

    this.ws.on('error', () => {
      // Error handled by close event
    });
  }
}
