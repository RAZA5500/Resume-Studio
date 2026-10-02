import { BadRequestException, HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AiService, DEFAULT_AI_MODEL, OPENROUTER_URL, type JsonRequest } from './ai.service.js';

const REQUEST: JsonRequest = {
  name: 'resume_bullets',
  system: 'You write resumes.',
  prompt: 'Three bullets for a nurse.',
  schema: { type: 'object', additionalProperties: false, required: ['bullets'], properties: { bullets: { type: 'array', items: { type: 'string' } } } },
  maxTokens: 500,
};

const service = (env: Record<string, string> = { OPENROUTER_API_KEY: 'sk-or-test' }) =>
  new AiService({ get: (key: string) => env[key] } as unknown as ConfigService);

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const answer = (content: string, finish_reason = 'stop') => reply({ model: DEFAULT_AI_MODEL, choices: [{ finish_reason, message: { content } }] });

/** Queues fetch responses and records every request body. */
function mockFetch(...responses: Response[]) {
  const fetch = vi.fn((_url: string, init: RequestInit) => {
    void init;
    const next = responses.shift();
    return next ? Promise.resolve(next) : Promise.reject(new Error('unexpected request'));
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    body: (call = 0) => JSON.parse(String(fetch.mock.calls[call][1].body)) as Record<string, any>,
  };
}

/** Retry backoff without the waiting; returns the spy to check the delays. */
const instantRetries = () =>
  vi.spyOn(AiService.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

beforeAll(() => Logger.overrideLogger(false));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AiService (OpenRouter)', () => {
  it('stays in offline mode without OPENROUTER_API_KEY', async () => {
    const ai = service({});
    expect(ai.enabled).toBe(false);
    await expect(ai.json(REQUEST)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('asks for schema-checked JSON from the configured model and parses the answer', async () => {
    const { fetch, body } = mockFetch(answer('{"bullets":["Triaged 30 patients per shift"]}'));
    const result = await service().json<{ bullets: string[] }>(REQUEST);

    expect(result.bullets).toEqual(['Triaged 30 patients per shift']);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    expect(body()).toMatchObject({
      model: DEFAULT_AI_MODEL,
      max_tokens: 500,
      messages: [
        { role: 'system', content: REQUEST.system },
        { role: 'user', content: REQUEST.prompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'resume_bullets', strict: true, schema: REQUEST.schema } },
      provider: { require_parameters: true },
      plugins: [{ id: 'response-healing' }],
    });
  });

  it('lists fallback models so OpenRouter can switch when one is down', async () => {
    const { body } = mockFetch(answer('{"bullets":[]}'));
    await service({ OPENROUTER_API_KEY: 'k', AI_MODEL: 'a/one', AI_FALLBACK_MODELS: 'b/two, c/three' }).json(REQUEST);
    expect(body().models).toEqual(['a/one', 'b/two', 'c/three']);
    expect(body().model).toBeUndefined();
  });

  it('retries rate limits and provider failures, including errors inside an HTTP 200', async () => {
    const sleep = instantRetries();
    const { fetch } = mockFetch(
      reply({ error: { code: 429, message: 'Rate limited' } }, 429, { 'retry-after': '2' }),
      reply({ error: { code: 502, message: 'Provider returned error' } }),
      answer('{"bullets":["ok"]}'),
    );
    await expect(service().json(REQUEST)).resolves.toEqual({ bullets: ['ok'] });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]); // Retry-After, then backoff
  });

  it('turns account problems into clear messages without retrying', async () => {
    const cases: [number, RegExp][] = [
      [401, /OPENROUTER_API_KEY/],
      [402, /out of credits/],
      [404, /not available on OpenRouter/],
    ];
    for (const [status, message] of cases) {
      const { fetch } = mockFetch(reply({ error: { code: status, message: 'nope' } }, status));
      await expect(service().json(REQUEST)).rejects.toThrow(message);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    instantRetries();
    mockFetch(reply({ error: { code: 429, message: 'slow down' } }, 429), reply({}, 429), reply({}, 429));
    await expect(service().json(REQUEST)).rejects.toBeInstanceOf(HttpException);
  });

  it('puts the schema into the prompt when no endpoint of the model supports structured outputs', async () => {
    const { body } = mockFetch(
      reply({ error: { code: 404, message: 'No endpoints found that support the requested parameters' } }, 404),
      answer('Here you go: {"bullets":["one"]}'),
    );
    await expect(service().json(REQUEST)).resolves.toEqual({ bullets: ['one'] });
    expect(body(1).response_format).toBeUndefined();
    expect(body(1).provider).toBeUndefined();
    expect(body(1).messages[0].content).toContain('"required":["bullets"]');
  });

  it('reports refusals, empty answers and unreadable JSON', async () => {
    mockFetch(reply({ choices: [{ finish_reason: 'stop', message: { content: '', refusal: 'I cannot help with that.' } }] }));
    await expect(service().json(REQUEST)).rejects.toBeInstanceOf(BadRequestException);
    mockFetch(answer('', 'length'));
    await expect(service().json(REQUEST)).rejects.toThrow(/ran out of space/);
    mockFetch(answer('not json at all'));
    await expect(service().json(REQUEST)).rejects.toThrow(/unreadable/);
  });
});
