import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserPlan = 'free' | 'lifetime';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  email: string;

  @Column({ type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  headline: string | null;

  /** "free" (daily limits) or "lifetime" (one-time PKR purchase, unlimited). */
  @Column({ type: 'varchar', length: 20, default: 'free' })
  plan: UserPlan;

  @Column({ type: 'timestamptz', nullable: true })
  planActivatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
