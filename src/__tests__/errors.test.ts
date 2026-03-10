import { QMEVError, MEV_ERROR_CODES } from '../errors';

describe('QMEVError', () => {
  it('creates error with code and message', () => {
    const err = new QMEVError('BUNDLE_REVERTED', 'tx failed');
    expect(err.code).toBe('BUNDLE_REVERTED');
    expect(err.message).toBe('tx failed');
    expect(err.name).toBe('QMEVError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(QMEVError);
  });

  it('creates error with details', () => {
    const details = { txHash: '0xabc' };
    const err = new QMEVError('SIMULATION_FAILED', 'sim error', details);
    expect(err.details).toEqual(details);
  });

  it('creates error without details', () => {
    const err = new QMEVError('INTERNAL_ERROR', 'oops');
    expect(err.details).toBeUndefined();
  });
});

describe('QMEVError.fromCode', () => {
  it('creates error from known code', () => {
    const err = QMEVError.fromCode('BUNDLE_REVERTED');
    expect(err.code).toBe('BUNDLE_REVERTED');
    expect(err.message).toBe('Bundle simulation reverted');
  });

  it('creates error from unknown code', () => {
    const err = QMEVError.fromCode('UNKNOWN_CODE');
    expect(err.code).toBe('UNKNOWN_CODE');
    expect(err.message).toBe('Unknown error: UNKNOWN_CODE');
  });

  it('passes details through', () => {
    const err = QMEVError.fromCode('RELAY_TIMEOUT', { elapsed: 5000 });
    expect(err.details).toEqual({ elapsed: 5000 });
  });
});

describe('QMEVError.networkError', () => {
  it('creates network error', () => {
    const cause = new TypeError('fetch failed');
    const err = QMEVError.networkError(cause);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toBe('Network connection failed');
    expect(err.details).toBe(cause);
  });

  it('creates network error without cause', () => {
    const err = QMEVError.networkError();
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.details).toBeUndefined();
  });
});

describe('QMEVError.authError', () => {
  it('creates auth error', () => {
    const err = QMEVError.authError();
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.message).toBe('Invalid API key or credentials');
  });
});

describe('QMEVError.fromJsonRpcError', () => {
  it('creates from JSON-RPC error', () => {
    const err = QMEVError.fromJsonRpcError({
      code: -32600,
      message: 'Invalid request',
      data: { field: 'method' },
    });
    expect(err.code).toBe('RPC_-32600');
    expect(err.message).toBe('Invalid request');
    expect(err.details).toEqual({ field: 'method' });
  });

  it('creates without data', () => {
    const err = QMEVError.fromJsonRpcError({
      code: -32601,
      message: 'Method not found',
    });
    expect(err.code).toBe('RPC_-32601');
    expect(err.details).toBeUndefined();
  });
});

describe('QMEVError.toJSON', () => {
  it('serializes to JSON', () => {
    const err = new QMEVError('BUNDLE_UNDERPAID', 'too low', { minBid: '1000' });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'QMEVError',
      code: 'BUNDLE_UNDERPAID',
      message: 'too low',
      details: { minBid: '1000' },
    });
  });
});

describe('MEV_ERROR_CODES', () => {
  it('has all expected error codes', () => {
    const expectedCodes = [
      'BUNDLE_REVERTED', 'BUNDLE_UNDERPAID', 'BUNDLE_EXPIRED',
      'BUNDLE_CONFLICT', 'BUNDLE_TOO_LARGE',
      'RELAY_TIMEOUT', 'RELAY_UNAVAILABLE', 'RELAY_REJECTED',
      'AUCTION_CLOSED', 'AUCTION_OUTBID',
      'SIMULATION_FAILED', 'SIMULATION_TIMEOUT',
      'AUTH_INVALID', 'AUTH_EXPIRED', 'RATE_LIMITED',
      'INVALID_PARAMS', 'INTERNAL_ERROR', 'NETWORK_ERROR',
      'WS_DISCONNECTED', 'WS_SUBSCRIBE_FAILED',
    ];
    for (const code of expectedCodes) {
      expect(MEV_ERROR_CODES[code]).toBeDefined();
      expect(typeof MEV_ERROR_CODES[code]).toBe('string');
    }
  });

  it('has 20 error codes', () => {
    expect(Object.keys(MEV_ERROR_CODES).length).toBe(20);
  });
});
