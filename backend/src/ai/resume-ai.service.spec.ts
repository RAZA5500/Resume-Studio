import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AiService } from './ai.service.js';
import { ResumeAiService } from './resume-ai.service.js';

/** An AiService whose provider answers with `json` (enabled) or is not configured. */
const ai = (json: () => Promise<unknown>, enabled = true) => ({ enabled, model: 'test/model', json: vi.fn(json) }) as unknown as AiService;

const outOfCredits = () => Promise.reject(new ServiceUnavailableException('The OpenRouter account is out of credits.'));

beforeAll(() => Logger.overrideLogger(false));

describe('ResumeAiService provider failures', () => {
  it('answers with the offline assistant when the provider is unavailable', async () => {
    const service = new ResumeAiService(ai(outOfCredits));

    const bullets = await service.bullets('Nurse', undefined, undefined, 3);
    expect(bullets.source).toBe('offline');
    expect(bullets.bullets).toHaveLength(3);

    const letter = await service.coverLetter({ personal: { fullName: 'Sara Khan' } }, 'We need a nurse with ICU experience.');
    expect(letter.source).toBe('offline');

    const generated = await service.generateResume('I am a nurse with 5 years of ICU experience.', 'Nurse');
    expect(generated.source).toBe('offline');
    expect(generated.content.personal.jobTitle).toBe('Nurse');

    const improved = await service.improve('responsible for patient care', 'bullets');
    expect(improved.source).toBe('offline');
  });

  it('still reports custom instructions and declined requests to the user', async () => {
    await expect(new ResumeAiService(ai(outOfCredits)).improve('text', 'custom', 'Make it rhyme')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const declined = () => Promise.reject(new BadRequestException('The AI declined to process this request.'));
    await expect(new ResumeAiService(ai(declined)).bullets('Nurse')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the AI answer when the provider works', async () => {
    const service = new ResumeAiService(ai(() => Promise.resolve({ bullets: ['Cared for 12 ICU patients per shift'] })));
    await expect(service.bullets('Nurse', undefined, undefined, 1)).resolves.toEqual({
      bullets: ['Cared for 12 ICU patients per shift'],
      source: 'ai',
    });
  });
});
