import { ChatResponse, MEVRole } from './types';
import { QMEVError } from './errors';

interface StreamChatOptions {
  conversationId?: string;
  role?: MEVRole;
}

/**
 * Stream a chat response from the Q MEV AI API using Server-Sent Events.
 * Calls onToken for each token as it arrives, and returns the full ChatResponse
 * once the stream completes.
 */
export async function streamChat(
  apiUrl: string,
  apiKey: string,
  message: string,
  onToken: (token: string) => void,
  options?: StreamChatOptions,
): Promise<ChatResponse> {
  const url = `${apiUrl}/v1/chat/stream`;
  const body = JSON.stringify({
    message,
    conversationId: options?.conversationId,
    role: options?.role,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      body,
    });
  } catch (err) {
    throw QMEVError.networkError(err);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new QMEVError(
      'STREAM_ERROR',
      `Stream request failed with status ${response.status}: ${text}`,
    );
  }

  if (!response.body) {
    throw new QMEVError('STREAM_ERROR', 'Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullMessage = '';
  let conversationId = options?.conversationId ?? '';
  let toolsCalled: ChatResponse['toolsCalled'];
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();

        if (payload === '[DONE]') continue;

        try {
          const event = JSON.parse(payload);

          if (event.type === 'token' && typeof event.token === 'string') {
            onToken(event.token);
            fullMessage += event.token;
          } else if (event.type === 'done') {
            conversationId = event.conversationId ?? conversationId;
            toolsCalled = event.toolsCalled;
          } else if (event.type === 'error') {
            throw new QMEVError('STREAM_ERROR', event.message ?? 'Stream error');
          }
        } catch (parseErr) {
          if (parseErr instanceof QMEVError) throw parseErr;
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    message: fullMessage,
    conversationId,
    toolsCalled,
  };
}
