import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

export type PaymentMethod = 'jazzcash' | 'easypaisa' | 'bank';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

/** A manual (JazzCash / Easypaisa / bank) payment submitted by a user and reviewed by an admin. */
@Entity('payments')
@Index(['method', 'transactionId'], { unique: true, where: `"status" <> 'rejected'` })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 20, default: 'lifetime' })
  plan: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'PKR' })
  currency: string;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  /** Transaction ID / TID from the JazzCash, Easypaisa or bank receipt. */
  @Column({ type: 'varchar', length: 64 })
  transactionId: string;

  @Column({ type: 'varchar', length: 40 })
  senderNumber: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  senderName: string | null;

  /** Stored receipt screenshot (file name inside UPLOAD_DIR/payments). */
  @Column({ type: 'varchar', length: 120, nullable: true, select: false })
  screenshotKey: string | null;

  @Column({ type: 'boolean', default: false })
  hasScreenshot: boolean;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
