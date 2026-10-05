import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserPlan = 'free' | 'lifetime';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  email: string;

  /** bcrypt hash; null for accounts that only sign in with Google or Apple. */
  @Column({ type: 'varchar', length: 100, nullable: true, select: false })
  passwordHash: string | null;

  /**
   * When the owner proved this email address (today: by signing in with Google or Apple, whose
   * emails are verified). Null for email + password sign-ups.
   */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  headline: string | null;

  /** "free" (daily limits) or "lifetime" (one-time PKR purchase, unlimited). */
  @Column({ type: 'varchar', length: 20, default: 'free' })
  plan: UserPlan;

  @Column({ type: 'timestamptz', nullable: true })
  planActivatedAt: Date | null;

  /**
   * Goes up when the password changes or the user signs out everywhere; login tokens carry the
   * value they were issued with and stop working once it no longer matches.
   */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
