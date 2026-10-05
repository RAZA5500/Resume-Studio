import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { User } from '../../users/user.entity.js';

/** The open email-verification code and link of one account (deleted once the email is verified). */
@Entity('email_verifications')
export class EmailVerification {
  @PrimaryColumn('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  /** HMAC of the 6-digit code (keyed with a server secret, so a database copy does not reveal it). */
  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  /** HMAC of the token in the email's link. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  linkHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Wrong codes typed for this code. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  /** Emails sent since windowStart (at most a few per hour). */
  @Column({ type: 'int', default: 1 })
  sendCount: number;

  @Column({ type: 'timestamptz' })
  windowStart: Date;
}
