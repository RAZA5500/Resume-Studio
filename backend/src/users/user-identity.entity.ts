import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { User } from './user.entity.js';

export type IdentityProvider = 'google' | 'apple';

/** A Google or Apple account linked to a user ("Sign in with Google / Apple"). */
@Entity('user_identities')
@Index(['provider', 'subject'], { unique: true })
export class UserIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 20 })
  provider: IdentityProvider;

  /** The provider's stable account id ("sub" in its ID token); emails can change, this does not. */
  @Column({ type: 'varchar', length: 255 })
  subject: string;

  /** Email the provider reported at the last sign-in (an Apple private relay address, for example). */
  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;
}
