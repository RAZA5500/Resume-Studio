import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { User } from '../../users/user.entity.js';

/**
 * One refresh token of a signed-in device. Each refresh replaces it with a new one in the same
 * family (rotation); the family is the sign-in on that device, so signing out ends all of it.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  /** SHA-256 of the token (the token itself is only in the device's cookie). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  /** Every token rotated from the same sign-in shares this id. */
  @Index()
  @Column('uuid')
  familyId: string;

  /** The account's tokenVersion at sign-in: a password change or "sign out everywhere" ends the token. */
  @Column({ type: 'int' })
  tokenVersion: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** When it was exchanged for a new one; using it again after a short grace period ends the family. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
