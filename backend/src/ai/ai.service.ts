import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { parseJsonLoose } from '../common/utils.js';

export interface JsonRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

/**
 * Thin wrapper around the Anthropic Messages API. Uses structured outputs
 * (JSON schema) so every AI feature receives validated, typed JSON.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY')?.trim();
    this.client = apiKey ? new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 }) : null;
    this.model = config.get<string>('AI_MODEL')?.trim() || 'claude-opus-5-5';
    if (this.client) this.logger.log(`AI enabled with model ${this.model}`);
    else this.logger.warn('ANTHROPIC_API_KEY not set — AI features run in offline (rule-based) mode.');
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async json<T>(request: JsonRequest): Promise<T> {
    const client = this.requireClient();
    try {
      const message = await client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        output_config: { format: { type: 'json_schema', schema: request.schema } },
      });
      if (message.stop_reason === 'refusal') {
        throw new BadRequestException('The AI declined to process this request.');
      }
      if (message.stop_reason === 'max_tokens') {
        this.logger.warn('AI response hit max_tokens; attempting to parse partial output.');
      }
      const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      return parseJsonLoose<T>(text);
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  private requireClient(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI is not configured. Add ANTHROPIC_API_KEY to backend/.env to enable this feature.',
      );
    }
    return this.client;
  }

  private toHttpError(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof Anthropic.APIError) {
      const code = error.status;
      this.logger.error(`Anthropic API error ${code}: ${error.message}`);
      if (code === 401 || code === 403) {
        return new ServiceUnavailableException('The AI provider rejected the API key. Check ANTHROPIC_API_KEY.');
      }
      if (code === 429) {
        return new HttpException('AI rate limit reached — please try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (code === 400) return new BadRequestException('The AI could not process this request.');
      return new ServiceUnavailableException('The AI service is temporarily unavailable. Please retry.');
    }
    this.logger.error(`AI request failed: ${String(error)}`);
    return new ServiceUnavailableException('AI request failed. Please try again.');
  }
}
