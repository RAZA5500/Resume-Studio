import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseJsonLoose } from '../common/utils.js';

export interface JsonRequest {
  /** Name of the JSON schema (letters, digits, "_" and "-"); helps the model understand the task. */
  name: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_AI_MODEL = 'anthropic/claude-sonnet-5.5';
const TIMEOUT_MS = 120_000;
const RETRIES = 2;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

interface ChatCompletion {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | Array<{ type?: string; text?: string }> | null; refusal?: string | null };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: number | string; message?: string };
}

/** An error answer from OpenRouter (also sent inside an HTTP 200 when the provider failed late). */
class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/**
 * Calls the configured model through OpenRouter's chat completions API with structured outputs
 * (JSON schema), so every AI feature receives validated, typed JSON. Without OPENROUTER_API_KEY the
 * app keeps working with its offline, rule-based assistant.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string | null;
  readonly model: string;
  private readonly fallbackModels: string[];
  /** Switched off when no endpoint of the model supports structured outputs; the schema then goes into the prompt. */
  private structuredOutputs = true;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENROUTER_API_KEY')?.trim() || null;
    this.model = config.get<string>('AI_MODEL')?.trim() || DEFAULT_AI_MODEL;
    this.fallbackModels = (config.get<string>('AI_FALLBACK_MODELS') ?? '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean);
    if (this.apiKey) this.logger.log(`AI enabled via OpenRouter: ${[this.model, ...this.fallbackModels].join(' → ')}`);
    else this.logger.warn('OPENROUTER_API_KEY not set — AI features run in offline (rule-based) mode.');
  }

  get enabled(): boolean {
    return this.apiKey !== null;
  }

  async json<T>(request: JsonRequest): Promise<T> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('AI is not configured. Set OPENROUTER_API_KEY on the server to enable this feature.');
    }
    let text: string;
    try {
      text = await this.complete(request);
    } catch (error) {
      throw this.toHttpError(error);
    }
    try {
      return parseJsonLoose<T>(text);
    } catch {
      this.logger.error(`Unreadable AI answer for "${request.name}": ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException('The AI returned an unreadable answer. Please try again.');
    }
  }

  /** Sends the request, retrying rate limits and provider hiccups with backoff. */
  private async complete(request: JsonRequest): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.send(request);
      } catch (error) {
        if (error instanceof OpenRouterError && this.structuredOutputs && lacksStructuredOutputs(error)) {
          this.logger.warn(`No ${this.model} endpoint supports structured outputs; the JSON schema now goes into the prompt.`);
          this.structuredOutputs = false;
          continue;
        }
        const retryable =
          error instanceof OpenRouterError ? RETRY_STATUSES.has(error.status) : error instanceof TypeError; // fetch network failure
        if (!retryable || attempt >= RETRIES) throw error;
        const wait = error instanceof OpenRouterError && error.retryAfterMs ? error.retryAfterMs : 1000 * 2 ** attempt;
        await this.sleep(Math.min(wait, 10_000));
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async send(request: JsonRequest): Promise<string> {
    const structured = this.structuredOutputs;
    const started = Date.now();
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        // With fallbacks OpenRouter tries the next model when one is down or rate limited.
        ...(this.fallbackModels.length ? { models: [this.model, ...this.fallbackModels] } : { model: this.model }),
        messages: [
          {
            role: 'system',
            content: structured
              ? request.system
              : `${request.system}\n\nAnswer with one JSON object that matches this JSON schema and nothing else:\n${JSON.stringify(request.schema)}`,
          },
          { role: 'user', content: request.prompt },
        ],
        max_tokens: request.maxTokens ?? 4096,
        ...(structured
          ? {
              response_format: { type: 'json_schema', json_schema: { name: request.name, strict: true, schema: request.schema } },
              // Only route to providers that enforce the schema; response healing repairs stray JSON syntax.
              provider: { require_parameters: true },
              plugins: [{ id: 'response-healing' }],
            }
          : {}),
      }),
    });

    const body = (await response.json().catch(() => null)) as ChatCompletion | null;
    if (!response.ok || !body || body.error) {
      const status = !response.ok ? response.status : Number(body?.error?.code) || 502;
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new OpenRouterError(status, body?.error?.message ?? `HTTP ${response.status}`, retryAfter > 0 ? retryAfter * 1000 : undefined);
    }

    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    const text = typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('');
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
      throw new BadRequestException('The AI declined to process this request.');
    }
    if (!text.trim()) {
      throw new ServiceUnavailableException(
        choice?.finish_reason === 'length'
          ? 'The AI ran out of space before answering. Please try again with shorter input.'
          : 'The AI returned an empty answer. Please try again.',
      );
    }
    if (choice?.finish_reason === 'length') this.logger.warn(`AI answer for "${request.name}" hit max_tokens; parsing what arrived.`);
    const { prompt_tokens: input = '?', completion_tokens: output = '?' } = body.usage ?? {};
    this.logger.debug(`${request.name}: ${body.model ?? this.model}, ${input} → ${output} tokens, ${Date.now() - started} ms`);
    return text;
  }

  private toHttpError(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof OpenRouterError) {
      this.logger.error(`OpenRouter error ${error.status}: ${error.message}`);
      switch (error.status) {
        case 400:
          return new BadRequestException('The AI could not process this request.');
        case 401:
          return new ServiceUnavailableException('OpenRouter rejected the API key. Check OPENROUTER_API_KEY.');
        case 402:
          return new ServiceUnavailableException('The OpenRouter account is out of credits. Add credits at openrouter.ai.');
        case 403:
          return new BadRequestException('The AI declined to process this request.');
        case 404:
          return new ServiceUnavailableException(`The AI model "${this.model}" is not available on OpenRouter. Check AI_MODEL.`);
        case 429:
          return new HttpException('AI rate limit reached — please try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
        default:
          return new ServiceUnavailableException('The AI service is temporarily unavailable. Please retry.');
      }
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return new ServiceUnavailableException('The AI took too long to answer. Please try again.');
    }
    this.logger.error(`AI request failed: ${String(error)}`);
    return new ServiceUnavailableException('AI request failed. Please try again.');
  }
}

/** OpenRouter answers 404 "No endpoints found that support…" when require_parameters rules out every provider. */
function lacksStructuredOutputs(error: OpenRouterError): boolean {
  return (error.status === 404 || error.status === 400) && /no endpoints|support|response_format|json_schema|structured/i.test(error.message);
}
