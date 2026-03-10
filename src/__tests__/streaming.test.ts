import { streamChat } from '../streaming';
import { QMEVError } from '../errors';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function sseResponse(events: string[], status = 200): Response {
  const text = events.join('\n') + '\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    text: async () => text,
  } as unknown as Response;
}

afterEach(() => {
  mockFetch.mockReset();
});

describe('streamChat', () => {
  it('streams tokens and returns full response', async () => {
    const events = [
      'data: {"type":"token","token":"Hello"}',
      'data: {"type":"token","token":" world"}',
      'data: {"type":"done","conversationId":"conv-1","toolsCalled":[]}',
      'data: [DONE]',
    ];
    mockFetch.mockResolvedValueOnce(sseResponse(events));

    const tokens: string[] = [];
    const result = await streamChat(
      'https://api.test.com',
      'key',
      'hi',
      (t) => tokens.push(t),
    );

    expect(tokens).toEqual(['Hello', ' world']);
    expect(result.message).toBe('Hello world');
    expect(result.conversationId).toBe('conv-1');
  });

  it('sends correct request', async () => {
    mockFetch.mockResolvedValueOnce(sseResponse([
      'data: {"type":"done","conversationId":"c1"}',
    ]));

    await streamChat('https://api.test.com', 'my-key', 'test', () => {}, {
      conversationId: 'prev-conv',
      role: 'searcher',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/chat/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer my-key',
          Accept: 'text/event-stream',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.message).toBe('test');
    expect(body.conversationId).toBe('prev-conv');
    expect(body.role).toBe('searcher');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      body: null,
    } as unknown as Response);

    await expect(
      streamChat('https://api.test.com', 'key', 'hi', () => {}),
    ).rejects.toThrow(QMEVError);
  });

  it('throws on null body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null,
    } as unknown as Response);

    await expect(
      streamChat('https://api.test.com', 'key', 'hi', () => {}),
    ).rejects.toThrow('Response body is null');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    try {
      await streamChat('https://api.test.com', 'key', 'hi', () => {});
      fail('should throw');
    } catch (err) {
      expect((err as QMEVError).code).toBe('NETWORK_ERROR');
    }
  });

  it('throws on stream error event', async () => {
    const events = [
      'data: {"type":"token","token":"partial"}',
      'data: {"type":"error","message":"context limit exceeded"}',
    ];
    mockFetch.mockResolvedValueOnce(sseResponse(events));

    await expect(
      streamChat('https://api.test.com', 'key', 'hi', () => {}),
    ).rejects.toThrow('context limit exceeded');
  });

  it('skips non-data lines', async () => {
    const events = [
      ': comment line',
      'event: ping',
      'data: {"type":"token","token":"ok"}',
      'data: {"type":"done","conversationId":"c1"}',
    ];
    mockFetch.mockResolvedValueOnce(sseResponse(events));

    const tokens: string[] = [];
    await streamChat('https://api.test.com', 'key', 'hi', (t) => tokens.push(t));

    expect(tokens).toEqual(['ok']);
  });

  it('skips malformed JSON data lines', async () => {
    const events = [
      'data: not-json',
      'data: {"type":"token","token":"valid"}',
      'data: {"type":"done","conversationId":"c1"}',
    ];
    mockFetch.mockResolvedValueOnce(sseResponse(events));

    const tokens: string[] = [];
    await streamChat('https://api.test.com', 'key', 'hi', (t) => tokens.push(t));

    expect(tokens).toEqual(['valid']);
  });

  it('preserves conversationId from options when not in done event', async () => {
    const events = [
      'data: {"type":"token","token":"hi"}',
      'data: [DONE]',
    ];
    mockFetch.mockResolvedValueOnce(sseResponse(events));

    const result = await streamChat(
      'https://api.test.com',
      'key',
      'hi',
      () => {},
      { conversationId: 'original' },
    );

    expect(result.conversationId).toBe('original');
  });
});
