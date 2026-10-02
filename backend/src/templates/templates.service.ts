import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DatabaseService } from '../database/database.service.js';
import { QueryTemplatesDto } from './dto/query-templates.dto.js';
import {
  CATALOG_VERSION,
  CATEGORY_LABELS,
  DEFAULT_TEMPLATE_ID,
  FONTS,
  generateTemplates,
  LAYOUTS,
  PALETTES,
} from './template-catalog.js';
import { Template } from './template.entity.js';

export interface TemplatePage {
  items: Template[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

@Injectable()
export class TemplatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    private readonly database: DatabaseService,
  ) {}

  /** Seeds (or refreshes) the generated catalog so a fresh database is usable immediately. */
  async seedCatalog(): Promise<void> {
    try {
      const generated = generateTemplates();
      const [count, outdated] = await Promise.all([
        this.templates.count(),
        this.templates.count({ where: { catalogVersion: LessThan(CATALOG_VERSION) } }),
      ]);
      if (count === generated.length && outdated === 0) return;

      this.logger.log(`Seeding template catalog (${generated.length} templates)…`);
      const chunkSize = 400;
      for (let i = 0; i < generated.length; i += chunkSize) {
        await this.templates.upsert(generated.slice(i, i + chunkSize), ['id']);
      }
      this.logger.log('Template catalog ready.');
    } catch (err) {
      this.logger.warn(`Template catalog seed skipped: ${(err as Error).message}`);
    }
  }

  onApplicationBootstrap(): void {
    // The database connects in the background; seed as soon as it is ready without delaying startup.
    void this.database.whenReady().then(() => this.seedCatalog());
  }

  async list(query: QueryTemplatesDto): Promise<TemplatePage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const qb = this.templates.createQueryBuilder('t');

    if (query.search?.trim()) {
      const term = query.search.trim().toLowerCase();
      qb.andWhere('(t.name ILIKE :like OR t.description ILIKE :like OR :term = ANY(t.tags))', {
        like: `%${term}%`,
        term,
      });
    }
    if (query.category && query.category !== 'all') qb.andWhere(':category = ANY(t.tags)', { category: query.category });
    if (query.layout) qb.andWhere('t.layout = :layout', { layout: query.layout });
    if (query.color) qb.andWhere('t.colorFamily = :color', { color: query.color });
    if (query.font) qb.andWhere('t.fontKey = :font', { font: query.font });
    if (query.ats === 'true') qb.andWhere('t.atsFriendly = true');
    if (query.photo) qb.andWhere('t.hasPhoto = :photo', { photo: query.photo === 'true' });
    if (query.columns) qb.andWhere('t.columns = :columns', { columns: Number(query.columns) });

    switch (query.sort) {
      case 'name':
        qb.orderBy('t.name', 'ASC');
        break;
      case 'featured':
        qb.orderBy('t.featured', 'DESC').addOrderBy('t.popularity', 'DESC');
        break;
      default:
        qb.orderBy('t.usageCount', 'DESC').addOrderBy('t.popularity', 'DESC');
    }
    qb.addOrderBy('t.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  meta() {
    const generated = generateTemplates();
    const categoryCounts = new Map<string, number>();
    for (const template of generated) {
      for (const tag of template.tags) categoryCounts.set(tag, (categoryCounts.get(tag) ?? 0) + 1);
    }
    return {
      total: generated.length,
      categories: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
        key,
        label,
        count: categoryCounts.get(key) ?? 0,
      })),
      layouts: LAYOUTS.map((l) => ({
        key: l.key,
        name: l.name,
        description: l.description,
        columns: l.columns,
        ats: l.ats,
        photo: l.photo,
      })),
      palettes: PALETTES,
      colorFamilies: [...new Set(PALETTES.map((p) => p.family))],
      fonts: FONTS,
    };
  }

  async findOne(id: string): Promise<Template> {
    const template = await this.templates.findOneBy({ id });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async findOrDefault(id?: string | null): Promise<Template> {
    if (id) {
      const template = await this.templates.findOneBy({ id });
      if (template) return template;
    }
    return this.findOne(DEFAULT_TEMPLATE_ID);
  }

  async recordUsage(id: string): Promise<void> {
    await this.templates.increment({ id }, 'usageCount', 1);
  }
}
