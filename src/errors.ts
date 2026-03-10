export const MEV_ERROR_CODES: Record<string, string> = {
  BUNDLE_REVERTED: 'Bundle simulation reverted',
  BUNDLE_UNDERPAID: 'Bundle bid too low',
  BUNDLE_EXPIRED: 'Bundle target block has passed',
  BUNDLE_CONFLICT: 'Bundle conflicts with existing bundle',
  BUNDLE_TOO_LARGE: 'Bundle exceeds maximum transaction count',
  RELAY_TIMEOUT: 'Relay response timeout',
  RELAY_UNAVAILABLE: 'Relay is not reachable',
  RELAY_REJECTED: 'Relay rejected the bundle',
  AUCTION_CLOSED: 'Auction for target block is closed',
  AUCTION_OUTBID: 'Bid was outbid by a higher offer',
  SIMULATION_FAILED: 'Bundle simulation encountered an error',
  SIMULATION_TIMEOUT: 'Bundle simulation timed out',
  AUTH_INVALID: 'Invalid API key or credentials',
  AUTH_EXPIRED: 'API key has expired',
  RATE_LIMITED: 'Request rate limit exceeded',
  INVALID_PARAMS: 'Invalid request parameters',
  INTERNAL_ERROR: 'Internal server error',
  NETWORK_ERROR: 'Network connection failed',
  WS_DISCONNECTED: 'WebSocket connection lost',
  WS_SUBSCRIBE_FAILED: 'Failed to subscribe to topic',
};

export class QMEVError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'QMEVError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, QMEVError.prototype);
  }

  static fromCode(code: string, details?: unknown): QMEVError {
    const message = MEV_ERROR_CODES[code] ?? `Unknown error: ${code}`;
    return new QMEVError(code, message, details);
  }

  static networkError(cause?: unknown): QMEVError {
    return new QMEVError(
      'NETWORK_ERROR',
      'Network connection failed',
      cause,
    );
  }

  static authError(): QMEVError {
    return new QMEVError('AUTH_INVALID', 'Invalid API key or credentials');
  }

  static fromJsonRpcError(error: {
    code: number;
    message: string;
    data?: unknown;
  }): QMEVError {
    return new QMEVError(
      `RPC_${error.code}`,
      error.message,
      error.data,
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
