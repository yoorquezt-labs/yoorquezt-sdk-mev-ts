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
