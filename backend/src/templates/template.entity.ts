import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { DesignSettings } from '../common/types/resume.types.js';

@Entity('templates')
export class Template {
  /** Stable slug, e.g. "modern-navy-inter". */
  @PrimaryColumn({ type: 'varchar', length: 120 })
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  layout: string;

  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Index()
  @Column({ type: 'boolean', default: true })
  atsFriendly: boolean;

  @Column({ type: 'smallint', default: 1 })
  columns: number;

  @Column({ type: 'boolean', default: false })
  hasPhoto: boolean;

  @Column({ type: 'varchar', length: 40 })
  paletteKey: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  colorFamily: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  fontKey: string;

  @Column({ type: 'int', default: 0 })
  popularity: number;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ type: 'int', default: 1 })
  catalogVersion: number;

  @Column({ type: 'jsonb' })
  config: DesignSettings;
}
