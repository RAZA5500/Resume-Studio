import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageService } from '../billing/usage.service.js';
import { createEmptyContent, createSampleContent, normalizeContent } from '../common/resume/resume-defaults.js';
import type { DesignSettings } from '../common/types/resume.types.js';
import { TemplatesService } from '../templates/templates.service.js';
import { UsersService } from '../users/users.service.js';
import { CreateResumeDto, UpdateResumeDto } from './dto/resume.dto.js';
import { Resume } from './resume.entity.js';

@Injectable()
export class ResumesService {
  constructor(
    @InjectRepository(Resume) private readonly resumes: Repository<Resume>,
    private readonly templates: TemplatesService,
    private readonly users: UsersService,
    private readonly usage: UsageService,
  ) {}

  list(userId: string): Promise<Resume[]> {
    return this.resumes.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  async get(userId: string, id: string): Promise<Resume> {
    const resume = await this.resumes.findOneBy({ id, userId });
    if (!resume) throw new NotFoundException('Resume not found');
    return resume;
  }

  async create(userId: string, dto: CreateResumeDto): Promise<Resume> {
    await this.usage.assertAllowed(userId, 'resume');
    const template = await this.templates.findOrDefault(dto.templateId);
    let content = dto.content ? normalizeContent(dto.content) : null;
    if (!content) {
      if (dto.useSample) {
        content = createSampleContent();
      } else {
        const user = await this.users.findById(userId);
        content = createEmptyContent(user.fullName, user.email);
      }
    }

    const resume = this.resumes.create({
      userId,
      title: dto.title?.trim() || this.defaultTitle(content.personal.jobTitle),
      templateId: template.id,
      content,
      design: { ...template.config },
      atsScore: null,
    });
    const saved = await this.resumes.save(resume);
    await this.usage.record(userId, 'resume', saved.id);
    await this.templates.recordUsage(template.id);
    return saved;
  }

  async update(userId: string, id: string, dto: UpdateResumeDto): Promise<Resume> {
    const resume = await this.get(userId, id);
    if (dto.title !== undefined) resume.title = dto.title.trim() || resume.title;
    if (dto.content !== undefined) resume.content = normalizeContent(dto.content);
    if (dto.templateId !== undefined && dto.templateId !== resume.templateId) {
      const template = await this.templates.findOrDefault(dto.templateId);
      resume.templateId = template.id;
      if (dto.design === undefined) resume.design = { ...template.config };
      await this.templates.recordUsage(template.id);
    }
    if (dto.design !== undefined) {
      resume.design = { ...resume.design, ...(dto.design as Partial<DesignSettings>) };
    }
    return this.resumes.save(resume);
  }

  async duplicate(userId: string, id: string): Promise<Resume> {
    await this.usage.assertAllowed(userId, 'resume');
    const source = await this.get(userId, id);
    const copy = this.resumes.create({
      userId,
      title: `${source.title} (Copy)`.slice(0, 160),
      templateId: source.templateId,
      content: source.content,
      design: source.design,
      atsScore: source.atsScore,
    });
    const saved = await this.resumes.save(copy);
    await this.usage.record(userId, 'resume', saved.id);
    return saved;
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const resume = await this.get(userId, id);
    await this.resumes.remove(resume);
    return { success: true };
  }

  async setAtsScore(userId: string, id: string, score: number): Promise<void> {
    await this.resumes.update({ id, userId }, { atsScore: score });
  }

  private defaultTitle(jobTitle: string): string {
    return jobTitle ? `${jobTitle} Resume` : 'Untitled Resume';
  }
}
