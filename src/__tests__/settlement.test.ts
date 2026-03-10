import { MEVGatewayClient } from '../gateway';
import { SettlementClient } from '../settlement';
import type {
  AuctionResult,
  RebateEpoch,
  RebateClaim,
  Intent,
  SolverInfo,
} from '../settlement';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    readyState: 1,
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    close: jest.fn(),
    removeAllListeners: jest.fn(),
  }));
});

function rpcSuccess<T>(result: T): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
  } as unknown as Response;
}

function rpcError(code: number, message: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, error: { code, message } }),
  } as unknown as Response;
}

function makeClient(apiKey?: string): SettlementClient {
  const gateway = new MEVGatewayClient({
    url: 'http://localhost:9099',
    apiKey,
  });
  return new SettlementClient({ gateway });
}

function lastRpcBody(): { method: string; params: unknown[] } {
  return JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body);
}

afterEach(() => {
  mockFetch.mockReset();
});

// --- AuctionSettlement ---

describe('SettlementClient.getAuctionResult', () => {
  it('calls settlement_getAuctionResult with auctionId', async () => {
    const client = makeClient('key');
    const result: AuctionResult = {
      auctionId: 'auction-1',
      winner: '0x1111111111111111111111111111111111111111',
      amount: '5000000000000000000',
      protocolFee: '250000000000000000',
      settled: true,
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(result));

    const res = await client.getAuctionResult('auction-1');

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getAuctionResult');
    expect(body.params).toEqual(['auction-1']);
    expect(res.winner).toBe('0x1111111111111111111111111111111111111111');
    expect(res.settled).toBe(true);
    expect(res.protocolFee).toBe('250000000000000000');
  });

  it('propagates RPC errors', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(rpcError(-32602, 'Auction not found'));

    await expect(client.getAuctionResult('nonexistent')).rejects.toThrow('Auction not found');
  });
});

describe('SettlementClient.getDeposit', () => {
  it('calls settlement_getDeposit and converts amount to bigint', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(
      rpcSuccess({
        auctionId: 'auction-2',
        amount: '1000000000000000000',
        token: '0x0000000000000000000000000000000000000000',
      }),
    );

    const deposit = await client.getDeposit(
      'auction-2',
      '0x2222222222222222222222222222222222222222',
    );

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getDeposit');
    expect(body.params).toEqual([
      'auction-2',
      '0x2222222222222222222222222222222222222222',
    ]);
    expect(deposit.amount).toBe(1000000000000000000n);
    expect(typeof deposit.amount).toBe('bigint');
    expect(deposit.token).toBe('0x0000000000000000000000000000000000000000');
  });
});

describe('SettlementClient.listAuctionResults', () => {
  it('calls settlement_listAuctionResults with block range', async () => {
    const client = makeClient();
    const results: AuctionResult[] = [
      {
        auctionId: 'a1',
        winner: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        protocolFee: '50',
        settled: true,
      },
      {
        auctionId: 'a2',
        winner: '0x2222222222222222222222222222222222222222',
        amount: '2000',
        protocolFee: '100',
        settled: false,
      },
    ];
    mockFetch.mockResolvedValueOnce(rpcSuccess(results));

    const res = await client.listAuctionResults(19000000, 19000100);

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_listAuctionResults');
    expect(body.params).toEqual([19000000, 19000100]);
    expect(res).toHaveLength(2);
    expect(res[0].auctionId).toBe('a1');
    expect(res[1].settled).toBe(false);
  });
});

// --- RebateDistributor ---

describe('SettlementClient.getRebateEpoch', () => {
  it('calls settlement_getRebateEpoch with epochId', async () => {
    const client = makeClient();
    const epoch: RebateEpoch = {
      epochId: 42,
      merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      totalAmount: '10000000000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      claimDeadline: 1700000000,
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(epoch));

    const res = await client.getRebateEpoch(42);

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getRebateEpoch');
    expect(body.params).toEqual([42]);
    expect(res.epochId).toBe(42);
    expect(res.merkleRoot).toMatch(/^0x[a-f0-9]{64}$/);
    expect(res.claimDeadline).toBe(1700000000);
  });
});

describe('SettlementClient.getCurrentEpoch', () => {
  it('calls settlement_getCurrentEpoch with no params', async () => {
    const client = makeClient();
    const epoch: RebateEpoch = {
      epochId: 99,
      merkleRoot: '0x' + 'aa'.repeat(32),
      totalAmount: '5000000000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      claimDeadline: 1700100000,
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(epoch));

    const res = await client.getCurrentEpoch();

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getCurrentEpoch');
    expect(body.params).toEqual([]);
    expect(res.epochId).toBe(99);
  });
});

describe('SettlementClient.getRebateClaim', () => {
  it('calls settlement_getRebateClaim with epochId and account', async () => {
    const client = makeClient();
    const claim: RebateClaim = {
      epochId: 42,
      account: '0x3333333333333333333333333333333333333333',
      amount: '500000000000000000',
      proof: [
        '0x' + 'bb'.repeat(32),
        '0x' + 'cc'.repeat(32),
        '0x' + 'dd'.repeat(32),
      ],
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(claim));

    const res = await client.getRebateClaim(42, '0x3333333333333333333333333333333333333333');

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getRebateClaim');
    expect(body.params).toEqual([42, '0x3333333333333333333333333333333333333333']);
    expect(res.proof).toHaveLength(3);
    expect(res.amount).toBe('500000000000000000');
  });
});

describe('SettlementClient.isRebateClaimed', () => {
  it('returns true when already claimed', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(rpcSuccess(true));

    const claimed = await client.isRebateClaimed(42, '0x3333333333333333333333333333333333333333');

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_isRebateClaimed');
    expect(body.params).toEqual([42, '0x3333333333333333333333333333333333333333']);
    expect(claimed).toBe(true);
  });

  it('returns false when not yet claimed', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(rpcSuccess(false));

    const claimed = await client.isRebateClaimed(1, '0x4444444444444444444444444444444444444444');

    expect(claimed).toBe(false);
  });
});

// --- IntentRegistry ---

describe('SettlementClient.getIntent', () => {
  it('calls settlement_getIntent with intentId', async () => {
    const client = makeClient();
    const intent: Intent = {
      id: '0x' + 'ff'.repeat(32),
      creator: '0x5555555555555555555555555555555555555555',
      intentType: 'swap',
      inputToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      outputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      inputAmount: '1000000000000000000',
      minOutputAmount: '2000000000',
      deadline: 1700050000,
      status: 'pending',
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(intent));

    const res = await client.getIntent('0x' + 'ff'.repeat(32));

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getIntent');
    expect(body.params).toEqual(['0x' + 'ff'.repeat(32)]);
    expect(res.intentType).toBe('swap');
    expect(res.status).toBe('pending');
    expect(res.solver).toBeUndefined();
  });
});

describe('SettlementClient.listIntents', () => {
  it('calls with status filter and limit', async () => {
    const client = makeClient();
    const intents: Intent[] = [
      {
        id: 'intent-1',
        creator: '0x5555555555555555555555555555555555555555',
        intentType: 'swap',
        inputToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        outputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        inputAmount: '1000000000000000000',
        minOutputAmount: '2000000000',
        deadline: 1700050000,
        status: 'fulfilled',
        solver: '0x6666666666666666666666666666666666666666',
      },
    ];
    mockFetch.mockResolvedValueOnce(rpcSuccess(intents));

    const res = await client.listIntents('fulfilled', 10);

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_listIntents');
    expect(body.params).toEqual(['fulfilled', 10]);
    expect(res).toHaveLength(1);
    expect(res[0].solver).toBe('0x6666666666666666666666666666666666666666');
  });

  it('sends empty params when no filters', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(rpcSuccess([]));

    await client.listIntents();

    const body = lastRpcBody();
    expect(body.params).toEqual([]);
  });

  it('sends only status when no limit', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(rpcSuccess([]));

    await client.listIntents('pending');

    const body = lastRpcBody();
    expect(body.params).toEqual(['pending']);
  });
});

describe('SettlementClient.getSolverInfo', () => {
  it('calls settlement_getSolverInfo with address', async () => {
    const client = makeClient();
    const solver: SolverInfo = {
      address: '0x7777777777777777777777777777777777777777',
      stake: '32000000000000000000',
      registered: true,
      successCount: 150,
      failureCount: 3,
    };
    mockFetch.mockResolvedValueOnce(rpcSuccess(solver));

    const res = await client.getSolverInfo('0x7777777777777777777777777777777777777777');

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_getSolverInfo');
    expect(body.params).toEqual(['0x7777777777777777777777777777777777777777']);
    expect(res.registered).toBe(true);
    expect(res.successCount).toBe(150);
    expect(res.failureCount).toBe(3);
  });
});

describe('SettlementClient.listSolvers', () => {
  it('calls settlement_listSolvers with no params', async () => {
    const client = makeClient();
    const solvers: SolverInfo[] = [
      {
        address: '0x7777777777777777777777777777777777777777',
        stake: '32000000000000000000',
        registered: true,
        successCount: 150,
        failureCount: 3,
      },
      {
        address: '0x8888888888888888888888888888888888888888',
        stake: '16000000000000000000',
        registered: false,
        successCount: 50,
        failureCount: 10,
      },
    ];
    mockFetch.mockResolvedValueOnce(rpcSuccess(solvers));

    const res = await client.listSolvers();

    const body = lastRpcBody();
    expect(body.method).toBe('settlement_listSolvers');
    expect(body.params).toEqual([]);
    expect(res).toHaveLength(2);
    expect(res[1].registered).toBe(false);
  });
});

// --- Error handling ---

describe('SettlementClient error propagation', () => {
  it('throws on network failure', async () => {
    const client = makeClient();
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(client.getAuctionResult('a1')).rejects.toThrow();
  });

  it('throws on HTTP 503', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as unknown as Response);

    await expect(client.getCurrentEpoch()).rejects.toThrow();
  });
});
