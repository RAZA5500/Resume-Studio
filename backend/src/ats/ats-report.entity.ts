import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import type { AiAnalysis } from '../ai/ai.types.js';
import { User } from '../users/user.entity.js';
import type { AtsResult } from './ats-scorer.js';

@Entity('ats_reports')
export class AtsReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  @Column({ type: 'uuid', nullable: true })
  resumeId: string | null;

  @Column({ type: 'varchar', length: 20 })
  sourceType: 'file' | 'resume' | 'text';

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'text', nullable: true })
  jobDescription: string | null;

  @Column({ type: 'text' })
  extractedText: string;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'varchar', length: 20 })
  grade: string;

  @Column({ type: 'jsonb' })
  result: AtsResult;

  @Column({ type: 'jsonb', nullable: true })
  aiAnalysis: AiAnalysis | null;

  @Column({ type: 'int', nullable: true })
  aiScore: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
