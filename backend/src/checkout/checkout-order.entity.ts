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
import type { GatewayAction } from './gateways/gateway.types.js';

/** "expired" is never stored: a "created" order past expiresAt is reported as expired. */
export type CheckoutOrderStatus = 'created' | 'paid' | 'failed' | 'cancelled';

/**
 * One attempt to buy through the online payment gateway. Orders hold the gateway session and its
 * outcome; only a paid order adds a row to the payments ledger (method "gateway"), next to the
 * QR payments that admins approve by hand.
 */
@Entity('checkout_orders')
export class CheckoutOrder {
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

  /** Gateway that handles the order (PAYMENT_GATEWAY when it was created). */
  @Column({ type: 'varchar', length: 30 })
  provider: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'created' })
  status: CheckoutOrderStatus;

  /** The gateway's id for the payment session (tracker, token…), when it issues one. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerRef: string | null;

  /** How the buyer's browser opens the gateway's payment page (served by GET checkout/orders/:id/pay). */
  @Column({ type: 'jsonb', nullable: true, select: false })
  action: GatewayAction | null;

  /** The gateway's transaction id once paid; the same value is the payment's transactionId. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  transactionId: string | null;

  /** The payments ledger row created when the order was paid. */
  @Column({ type: 'uuid', nullable: true })
  paymentId: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
