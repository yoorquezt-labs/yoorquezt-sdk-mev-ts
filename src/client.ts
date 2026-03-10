import {
  ChatResponse,
  EngineHealth,
  MEVRole,
  QMEVClientConfig,
  QMEVTool,
} from './types';
import { QMEVError } from './errors';
import { streamChat } from './streaming';

/**
 * QMEVClient provides access to the Q MEV AI API.
 * Handles chat interactions, tool listing, and engine health checks.
 */
export class QMEVClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly role: MEVRole;

  constructor(config: QMEVClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.role = config.role ?? 'analyst';
  }

  /**
   * Send a chat message to Q MEV AI and receive a complete response.
   */
  async chat(
    message: string,
    conversationId?: string,
    context?: Record<string, unknown>,
  ): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      message,
      role: this.role,
    };
    if (conversationId) body.conversationId = conversationId;
    if (context) body.context = context;

    const data = await this.request<ChatResponse>('POST', '/v1/chat', body);
    return data;
  }

  /**
   * Stream a chat response, calling onToken for each token as it arrives.
   */
  async chatStream(
    message: string,
    onToken: (token: string) => void,
    conversationId?: string,
  ): Promise<ChatResponse> {
    return streamChat(this.apiUrl, this.apiKey, message, onToken, {
      conversationId,
      role: this.role,
    });
  }

  /**
   * List all available Q MEV tools.
   */
  async listTools(): Promise<QMEVTool[]> {
    return this.request<QMEVTool[]>('GET', '/v1/tools');
  }

  /**
   * Get the current engine health status.
   */
  async health(): Promise<EngineHealth> {
    return this.request<EngineHealth>('GET', '/health');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw QMEVError.networkError(err);
    }

    if (response.status === 401 || response.status === 403) {
      throw QMEVError.authError();
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => null);
      }
      throw new QMEVError(
        'HTTP_ERROR',
        `Request failed: ${method} ${path} => ${response.status}`,
        errorBody,
      );
    }

    return (await response.json()) as T;
  }
}
