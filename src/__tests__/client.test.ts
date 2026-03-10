import { QMEVClient } from '../client';
import { QMEVError } from '../errors';

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
  } as unknown as Response;
}

function makeClient(overrides?: Partial<{ apiUrl: string; apiKey: string; role: string }>) {
  return new QMEVClient({
    apiUrl: 'https://api.test.com',
    apiKey: 'test-key-123',
    role: 'searcher',
    ...overrides,
  } as any);
}

afterEach(() => {
  mockFetch.mockReset();
});

describe('QMEVClient constructor', () => {
  it('trims trailing slashes from apiUrl', () => {
    const client = makeClient({ apiUrl: 'https://api.test.com///' });
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'healthy' }));
    client.health();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/health',
      expect.any(Object),
    );
  });

  it('defaults role to analyst', () => {
    const client = new QMEVClient({
      apiUrl: 'https://api.test.com',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'ok', conversationId: '1' }));
    client.chat('hello');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"analyst"'),
      }),
    );
  });
});

describe('QMEVClient.chat', () => {
  it('sends POST with message and role', async () => {
    const client = makeClient();
    const chatResp = { message: 'Hello!', conversationId: 'conv-1' };
    mockFetch.mockResolvedValueOnce(jsonResponse(chatResp));

    const result = await client.chat('test message');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key-123',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.message).toBe('test message');
    expect(body.role).toBe('searcher');
    expect(result.message).toBe('Hello!');
    expect(result.conversationId).toBe('conv-1');
  });

  it('includes conversationId when provided', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'ok', conversationId: 'c2' }));

    await client.chat('follow up', 'conv-1');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.conversationId).toBe('conv-1');
  });

  it('includes context when provided', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'ok', conversationId: '1' }));

    await client.chat('analyze', undefined, { chain: 'ethereum' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.context).toEqual({ chain: 'ethereum' });
  });

  it('does not include conversationId when not provided', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'ok', conversationId: '1' }));

    await client.chat('hello');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.conversationId).toBeUndefined();
  });
});

describe('QMEVClient.listTools', () => {
  it('sends GET to /v1/tools', async () => {
    const client = makeClient();
    const tools = [{ name: 'arb_scan', description: 'Scan arbs', parameters: {} }];
    mockFetch.mockResolvedValueOnce(jsonResponse(tools));

    const result = await client.listTools();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/tools',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(tools);
  });
});

describe('QMEVClient.health', () => {
  it('sends GET to /health', async () => {
    const client = makeClient();
    const health = {
      status: 'healthy',
      uptime: 3600,
      version: '1.0.0',
      chainId: 1,
      blockNumber: 19000000,
      peerCount: 12,
      mempoolSize: 500,
      bundleCount: 42,
      activeRelays: 3,
      lastBlockTime: 1700000000,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(health));

    const result = await client.health();

    expect(result.status).toBe('healthy');
    expect(result.chainId).toBe(1);
    expect(result.activeRelays).toBe(3);
  });
});

describe('QMEVClient error handling', () => {
  it('throws authError on 401', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    try {
      await client.health();
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(QMEVError);
      expect((err as QMEVError).code).toBe('AUTH_INVALID');
    }
  });

  it('throws authError on 403', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));

    await expect(client.health()).rejects.toThrow(QMEVError);
  });

  it('throws HTTP_ERROR on 500', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'internal' }, 500));

    try {
      await client.health();
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(QMEVError);
      expect((err as QMEVError).code).toBe('HTTP_ERROR');
    }
  });

  it('throws networkError on fetch failure', async () => {
    const client = makeClient();
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    try {
      await client.health();
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(QMEVError);
      expect((err as QMEVError).code).toBe('NETWORK_ERROR');
    }
  });

  it('handles non-JSON error response', async () => {
    const client = makeClient();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json'); },
      text: async () => 'Bad Gateway',
    } as unknown as Response);

    try {
      await client.health();
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(QMEVError);
      expect((err as QMEVError).code).toBe('HTTP_ERROR');
      expect((err as QMEVError).details).toBe('Bad Gateway');
    }
  });
});
