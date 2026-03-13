import { MEVGatewayClient } from '../gateway';
import { QMEVError } from '../errors';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock WebSocket to prevent actual connections
jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    readyState: 1, // OPEN
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    close: jest.fn(),
    removeAllListeners: jest.fn(),
  }));
});

function rpcSuccess<T>(id: number, result: T): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id, result }),
  } as unknown as Response;
}

function rpcError(id: number, code: number, message: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id, error: { code, message } }),
  } as unknown as Response;
}

function makeGateway(apiKey?: string) {
  return new MEVGatewayClient({
    url: 'http://localhost:9099',
    apiKey,
  });
}

afterEach(() => {
  mockFetch.mockReset();
});

describe('MEVGatewayClient.call', () => {
  it('sends JSON-RPC request with auth header', async () => {
    const gw = makeGateway('secret-key');
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, 'ok'));

    await gw.call('test_method', ['arg1']);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9099',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('test_method');
    expect(body.params).toEqual(['arg1']);
  });

  it('sends without auth when no apiKey', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, 'ok'));

    await gw.call('test_method');

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws QMEVError on RPC error', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcError(1, -32601, 'Method not found'));

    try {
      await gw.call('bad_method');
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(QMEVError);
      expect((err as QMEVError).code).toBe('RPC_-32601');
      expect((err as QMEVError).message).toBe('Method not found');
    }
  });

  it('throws on HTTP error', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as unknown as Response);

    await expect(gw.call('test')).rejects.toThrow(QMEVError);
  });

  it('throws networkError on fetch failure', async () => {
    const gw = makeGateway();
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));

    try {
      await gw.call('test');
      fail('should throw');
    } catch (err) {
      expect((err as QMEVError).code).toBe('NETWORK_ERROR');
    }
  });

  it('increments request IDs', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValue(rpcSuccess(1, 'ok'));

    await gw.call('method1');
    await gw.call('method2');

    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body2.id).toBeGreaterThan(body1.id);
  });
});

describe('MEVGatewayClient.submitBundle', () => {
  it('calls mev_submitBundle with bundle', async () => {
    const gw = makeGateway('key');
    const bundle = {
      id: 'b1',
      transactions: ['0xabc'],
      blockNumber: 19000000,
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, 'bundle-hash-123'));

    const result = await gw.submitBundle(bundle);

    expect(result).toBe('bundle-hash-123');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe('mev_submitBundle');
    expect(body.params[0]).toEqual(bundle);
  });
});

describe('MEVGatewayClient.getBundleStatus', () => {
  it('calls mev_getBundleStatus', async () => {
    const gw = makeGateway();
    const status = {
      bundleId: 'b1',
      status: 'landed',
      blockNumber: 19000001,
      profit: '1000000000000000',
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, status));

    const result = await gw.getBundleStatus('b1');

    expect(result.status).toBe('landed');
    expect(result.profit).toBe('1000000000000000');
  });
});

describe('MEVGatewayClient.simulateBundle', () => {
  it('calls mev_simulateBundle', async () => {
    const gw = makeGateway();
    const simResult = {
      success: true,
      profit: '500000000000000',
      gasUsed: 150000,
      effectiveGasPrice: '20000000000',
      logs: [],
      stateChanges: [],
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, simResult));

    const result = await gw.simulateBundle({
      id: 'b1',
      transactions: ['0x1', '0x2'],
      blockNumber: 19000000,
    });

    expect(result.success).toBe(true);
    expect(result.gasUsed).toBe(150000);
  });
});

describe('MEVGatewayClient.getAuction', () => {
  it('calls without params when no blockNumber', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, {
      blockNumber: 19000000,
      bids: [],
      status: 'open',
      deadline: 1700000000,
    }));

    const result = await gw.getAuction();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual([]);
    expect(result.status).toBe('open');
  });

  it('passes blockNumber as param', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, {
      blockNumber: 19000001,
      bids: [],
      status: 'closed',
      deadline: 1700000012,
    }));

    await gw.getAuction(19000001);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual([19000001]);
  });
});

describe('MEVGatewayClient.getMempoolSnapshot', () => {
  it('returns mempool data', async () => {
    const gw = makeGateway();
    const snapshot = {
      size: 1000,
      pendingTxs: 500,
      gasStats: { min: '1', max: '100', avg: '30', median: '25' },
      topTokens: [{ token: 'WETH', count: 150 }],
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, snapshot));

    const result = await gw.getMempoolSnapshot();
    expect(result.size).toBe(1000);
    expect(result.topTokens[0].token).toBe('WETH');
  });
});

describe('MEVGatewayClient.getRelayStats', () => {
  it('returns relay stats without filter', async () => {
    const gw = makeGateway();
    const stats = [{
      relayId: 'r1',
      name: 'flashbots',
      url: 'https://relay.flashbots.net',
      status: 'active',
      bundlesSubmitted: 100,
      bundlesLanded: 85,
      avgLatencyMs: 150,
      successRate: 0.85,
      lastSeen: 1700000000,
    }];
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, stats));

    const result = await gw.getRelayStats();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual([]);
    expect(result[0].name).toBe('flashbots');
  });

  it('passes relayId filter', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, []));

    await gw.getRelayStats('r1');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual(['r1']);
  });
});

describe('MEVGatewayClient.getOFAStats', () => {
  it('returns OFA stats', async () => {
    const gw = makeGateway();
    const ofa = {
      txsProtected: 5000,
      sandwichBlocked: 120,
      mevCaptured: '10000000000000000000',
      userRebates: '4000000000000000000',
      rebateRate: 0.4,
      avgSavingsPerTx: '800000000000000',
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, ofa));

    const result = await gw.getOFAStats('24h');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual(['24h']);
    expect(result.txsProtected).toBe(5000);
  });
});

describe('MEVGatewayClient.getProfitHistory', () => {
  it('passes timeRange and strategy params', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, {
      timeRange: '7d',
      totalProfit: '1000',
      totalCost: '200',
      netProfit: '800',
      bundleCount: 50,
      successRate: 0.9,
      byStrategy: {},
      dataPoints: [],
    }));

    await gw.getProfitHistory('7d', 'arb');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual(['7d', 'arb']);
  });

  it('sends empty params when no args', async () => {
    const gw = makeGateway();
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, {
      timeRange: '24h',
      totalProfit: '0',
      totalCost: '0',
      netProfit: '0',
      bundleCount: 0,
      successRate: 0,
      byStrategy: {},
      dataPoints: [],
    }));

    await gw.getProfitHistory();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual([]);
  });
});

describe('MEVGatewayClient.disconnect', () => {
  it('clears state without error', () => {
    const gw = makeGateway();
    expect(() => gw.disconnect()).not.toThrow();
  });
});

describe('MEVGatewayClient URL handling', () => {
  it('trims trailing slashes', async () => {
    const gw = new MEVGatewayClient({ url: 'http://localhost:9099///' });
    mockFetch.mockResolvedValueOnce(rpcSuccess(1, 'ok'));

    await gw.call('test');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9099',
      expect.any(Object),
    );
  });
});

// --- WebSocket subscription and lifecycle tests ---

import WebSocket from 'ws';

const MockWebSocket = WebSocket as unknown as jest.Mock & {
  OPEN: number;
  CLOSED: number;
  CONNECTING: number;
  CLOSING: number;
};

// Set WebSocket static constants on the mock constructor so gateway.ts comparisons work
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;
MockWebSocket.CONNECTING = 0;
MockWebSocket.CLOSING = 2;

/**
 * Helper: create a gateway, call subscribe() to trigger ensureWebSocket(),
 * and return the mock ws instance along with captured event handlers.
 */
function setupWsGateway(apiKey?: string) {
  MockWebSocket.mockClear();

  const gw = makeGateway(apiKey);
  const handlers: Record<string, (...args: any[]) => void> = {};
  const onceHandlers: Record<string, (...args: any[]) => void> = {};

  // Re-configure the next mock instance
  MockWebSocket.mockImplementation((() => {
    const instance = {
      readyState: 1, // OPEN
      send: jest.fn(),
      on: jest.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb;
      }),
      once: jest.fn((event: string, cb: (...args: any[]) => void) => {
        onceHandlers[event] = cb;
      }),
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    };
    return instance;
  }) as any);

  return { gw, handlers, onceHandlers, getMockWs: () => MockWebSocket.mock.results[0]?.value };
}

describe('MEVGatewayClient.subscribe', () => {
  it('sends mev_subscribe JSON-RPC request when ws is OPEN', () => {
    const { gw, getMockWs } = setupWsGateway();
    const onEvent = jest.fn();

    gw.subscribe(['auctions', 'bundles'], onEvent);

    const ws = getMockWs();
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.jsonrpc).toBe('2.0');
    expect(sent.method).toBe('mev_subscribe');
    expect(sent.params[0].topics).toEqual(['auctions', 'bundles']);
    expect(sent.params[0].subscriptionId).toMatch(/^sub_/);
  });

  it('returns an unsubscribe function that sends mev_unsubscribe', () => {
    const { gw, getMockWs } = setupWsGateway();
    const onEvent = jest.fn();

    const unsub = gw.subscribe(['auctions'], onEvent);
    const ws = getMockWs();

    // First call was mev_subscribe
    expect(ws.send).toHaveBeenCalledTimes(1);

    // Call unsubscribe
    unsub();

    expect(ws.send).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(ws.send.mock.calls[1][0]);
    expect(sent.method).toBe('mev_unsubscribe');
    expect(sent.params[0]).toMatch(/^sub_/);
  });

  it('defers subscribe until ws open event when not yet OPEN', () => {
    MockWebSocket.mockClear();
    const gw = makeGateway();
    const onceHandlers: Record<string, (...args: any[]) => void> = {};

    MockWebSocket.mockImplementation((() => ({
      readyState: 0, // CONNECTING
      send: jest.fn(),
      on: jest.fn(),
      once: jest.fn((event: string, cb: (...args: any[]) => void) => {
        onceHandlers[event] = cb;
      }),
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    })) as any);

    const onEvent = jest.fn();
    gw.subscribe(['auctions'], onEvent);

    const ws = MockWebSocket.mock.results[0]?.value;
    // Should NOT have sent yet (ws is CONNECTING)
    expect(ws.send).not.toHaveBeenCalled();
    // Should have registered a once('open') handler
    expect(onceHandlers['open']).toBeDefined();

    // Simulate open — update readyState then fire open callback
    ws.readyState = 1; // OPEN
    onceHandlers['open']();
    expect(ws.send).toHaveBeenCalledTimes(1);
  });
});

describe('MEVGatewayClient subscription notifications', () => {
  it('dispatches subscription notification to correct handler', () => {
    const { gw, handlers } = setupWsGateway();
    const onEvent = jest.fn();

    gw.subscribe(['auctions'], onEvent);

    // Get the subscriptionId from the sent message
    const ws = MockWebSocket.mock.results[0]?.value;
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    const subId = sent.params[0].subscriptionId;

    // Simulate incoming subscription notification
    const event = { type: 'auction_update', data: { block: 100 }, timestamp: 1700000000 };
    const notification = JSON.stringify({
      method: 'mev_subscription',
      params: { subscriptionId: subId, event },
    });
    handlers['message'](notification);

    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('ignores notifications for unknown subscription IDs', () => {
    const { gw, handlers } = setupWsGateway();
    const onEvent = jest.fn();

    gw.subscribe(['auctions'], onEvent);

    const notification = JSON.stringify({
      method: 'mev_subscription',
      params: { subscriptionId: 'sub_unknown', event: { type: 'x', data: {}, timestamp: 0 } },
    });
    handlers['message'](notification);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('ignores malformed messages without crashing', () => {
    const { gw, handlers } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    expect(() => handlers['message']('not valid json {')).not.toThrow();
  });
});

describe('MEVGatewayClient.disconnect with active WebSocket', () => {
  it('calls removeAllListeners, close, and nulls the ws', () => {
    const { gw, getMockWs } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    const ws = getMockWs();
    gw.disconnect();

    expect(ws.removeAllListeners).toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalled();
  });

  it('rejects pending calls with WS_DISCONNECTED error', () => {
    const { gw, handlers } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    // Manually add a pending call by accessing internals
    // We can do this by simulating an RPC call over WS that hasn't resolved yet
    const pendingCalls = (gw as any).pendingCalls as Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >;
    const rejectFn = jest.fn();
    pendingCalls.set(99, { resolve: jest.fn(), reject: rejectFn });

    gw.disconnect();

    expect(rejectFn).toHaveBeenCalledTimes(1);
    const err = rejectFn.mock.calls[0][0];
    expect(err).toBeInstanceOf(QMEVError);
    expect(err.code).toBe('WS_DISCONNECTED');
  });
});

describe('MEVGatewayClient.ensureWebSocket', () => {
  it('reuses existing open connection', () => {
    const { gw } = setupWsGateway();

    // First subscribe creates the WS
    gw.subscribe(['auctions'], jest.fn());
    expect(MockWebSocket).toHaveBeenCalledTimes(1);

    // Second subscribe should reuse
    gw.subscribe(['bundles'], jest.fn());
    expect(MockWebSocket).toHaveBeenCalledTimes(1);
  });

  it('creates connection with auth header when apiKey provided', () => {
    const { gw } = setupWsGateway('my-secret-key');

    gw.subscribe(['auctions'], jest.fn());

    expect(MockWebSocket).toHaveBeenCalledWith(
      'ws://localhost:9099',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-secret-key',
        }),
      }),
    );
  });

  it('creates connection without auth header when no apiKey', () => {
    const { gw } = setupWsGateway();

    gw.subscribe(['auctions'], jest.fn());

    expect(MockWebSocket).toHaveBeenCalledWith(
      'ws://localhost:9099',
      expect.objectContaining({
        headers: {},
      }),
    );
  });
});

describe('MEVGatewayClient RPC response handling over WebSocket', () => {
  it('resolves pending call on successful RPC response', () => {
    const { gw, handlers } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    const pendingCalls = (gw as any).pendingCalls as Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >;
    const resolveFn = jest.fn();
    pendingCalls.set(42, { resolve: resolveFn, reject: jest.fn() });

    handlers['message'](JSON.stringify({ id: 42, result: { status: 'ok' } }));

    expect(resolveFn).toHaveBeenCalledWith({ status: 'ok' });
    expect(pendingCalls.has(42)).toBe(false);
  });

  it('rejects pending call on RPC error response', () => {
    const { gw, handlers } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    const pendingCalls = (gw as any).pendingCalls as Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >;
    const rejectFn = jest.fn();
    pendingCalls.set(43, { resolve: jest.fn(), reject: rejectFn });

    handlers['message'](JSON.stringify({
      id: 43,
      error: { code: -32600, message: 'Invalid Request' },
    }));

    expect(rejectFn).toHaveBeenCalledTimes(1);
    const err = rejectFn.mock.calls[0][0];
    expect(err).toBeInstanceOf(QMEVError);
    expect(err.code).toBe('RPC_-32600');
    expect(pendingCalls.has(43)).toBe(false);
  });

  it('ignores RPC response with no matching pending call', () => {
    const { gw, handlers } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    // Should not throw
    expect(() =>
      handlers['message'](JSON.stringify({ id: 999, result: 'orphan' })),
    ).not.toThrow();
  });
});

describe('MEVGatewayClient auto-reconnection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reconnects after close when there are active subscriptions', () => {
    const { gw, handlers } = setupWsGateway();
    gw.subscribe(['auctions'], jest.fn());

    expect(MockWebSocket).toHaveBeenCalledTimes(1);

    // Mark the first ws as CLOSED so ensureWebSocket creates a new one
    const firstWs = MockWebSocket.mock.results[0]?.value;
    firstWs.readyState = WebSocket.CLOSED;

    // Simulate close event
    handlers['close']();

    // Advance timers past the 3-second reconnect delay
    jest.advanceTimersByTime(3000);

    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect when no active subscriptions', () => {
    const { gw, handlers } = setupWsGateway();
    const unsub = gw.subscribe(['auctions'], jest.fn());

    // Remove subscription before close
    unsub();

    const firstWs = MockWebSocket.mock.results[0]?.value;
    firstWs.readyState = WebSocket.CLOSED;

    handlers['close']();
    jest.advanceTimersByTime(3000);

    // Should NOT have created a second connection
    expect(MockWebSocket).toHaveBeenCalledTimes(1);
  });
});

describe('MEVGatewayClient error event', () => {
  it('handles error event without crashing', () => {
    const { gw, handlers } = setupWsGateway();
    // Trigger ensureWebSocket so event handlers are registered
    gw.subscribe(['auctions'], jest.fn());

    // error handler just exists to prevent unhandled errors; close handles cleanup
    expect(handlers['error']).toBeDefined();
    expect(() => handlers['error'](new Error('connection reset'))).not.toThrow();
  });
});
