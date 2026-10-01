import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { User } from '../users/user.entity.js';
import type { UsageEventKind } from './billing-config.service.js';

/** One row per counted action: a free user's resume / cover letter / document edit, or any user's AI call. */
@Entity('usage_events')
@Index(['userId', 'kind', 'day'])
export class UsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 20 })
  kind: UsageEventKind;

  /** Calendar day in the app timezone, e.g. 2026-09-26. */
  @Column({ type: 'varchar', length: 10 })
  day: string;

  /** The resume / document the action applied to (documents are counted per distinct file). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  resourceId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
