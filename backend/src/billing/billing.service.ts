import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { User, type UserPlan } from '../users/user.entity.js';
import { BillingConfigService } from './billing-config.service.js';
import { SubmitPaymentDto } from './dto/billing.dto.js';
import { Payment, type PaymentStatus } from './payment.entity.js';
import { UsageService } from './usage.service.js';

const SCREENSHOT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly screenshotDir: string;

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly config: BillingConfigService,
    private readonly usage: UsageService,
    env: ConfigService,
  ) {
    const dir = env.get<string>('UPLOAD_DIR') || 'uploads';
    this.screenshotDir = join(isAbsolute(dir) ? dir : resolve(process.cwd(), dir), 'payments');
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.screenshotDir, { recursive: true });
  }

  publicConfig() {
    return {
      price: this.config.price,
      currency: this.config.currency,
      methods: this.config.methods,
      freeLimits: this.config.limits,
      aiLimits: this.config.aiLimits,
      timezone: this.config.timezone,
      supportWhatsapp: this.config.supportWhatsapp,
    };
  }

  async me(userId: string) {
    const [usage, payment] = await Promise.all([
      this.usage.summary(userId),
      this.payments.findOne({ where: { userId }, order: { createdAt: 'DESC' } }),
    ]);
    return { ...usage, price: this.config.price, currency: this.config.currency, payment: payment ?? null };
  }

  async submit(userId: string, dto: SubmitPaymentDto, screenshot?: Express.Multer.File): Promise<Payment> {
    if (await this.usage.isLifetime(userId)) throw new BadRequestException('You already have lifetime access.');
    if (!this.config.methods.some((m) => m.key === dto.method)) {
      throw new BadRequestException('This payment method is not available.');
    }
    if (await this.payments.countBy({ userId, status: 'pending' })) {
      throw new ConflictException('Your previous payment is still being reviewed. We will activate your account shortly.');
    }
    const transactionId = dto.transactionId.trim().toUpperCase();
    const reused = await this.payments.countBy({ method: dto.method, transactionId, status: Not('rejected') });
    if (reused) throw new ConflictException('This transaction ID has already been submitted.');

    let screenshotKey: string | null = null;
    if (screenshot) {
      const extension = SCREENSHOT_TYPES[screenshot.mimetype];
      if (!extension) throw new BadRequestException('The receipt screenshot must be a PNG, JPG or WebP image.');
      if (screenshot.size > MAX_SCREENSHOT_BYTES) throw new BadRequestException('The screenshot must be smaller than 5 MB.');
      screenshotKey = `${randomUUID()}.${extension}`;
      await writeFile(join(this.screenshotDir, screenshotKey), screenshot.buffer);
    }

    const payment = await this.payments.save(
      this.payments.create({
        userId,
        plan: 'lifetime',
        amount: this.config.price,
        currency: this.config.currency,
        method: dto.method,
        transactionId,
        senderNumber: dto.senderNumber.replace(/\s+/g, ' ').trim(),
        senderName: dto.senderName?.trim() || null,
        screenshotKey,
        hasScreenshot: !!screenshotKey,
        status: 'pending',
        adminNote: null,
        reviewedBy: null,
        reviewedAt: null,
      }),
    );
    delete (payment as Partial<Payment>).screenshotKey;
    return payment;
  }

  // ------------------------------------------------------------------ admin
  listPayments(status: PaymentStatus | 'all' = 'pending') {
    const query = this.payments
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .addSelect(['u.id', 'u.email', 'u.fullName', 'u.plan'])
      .orderBy('p.createdAt', status === 'pending' ? 'ASC' : 'DESC')
      .take(200);
    if (status !== 'all') query.where('p.status = :status', { status });
    return query.getMany();
  }

  async screenshot(id: string): Promise<{ buffer: Buffer; type: string }> {
    const payment = await this.payments.findOne({ where: { id }, select: { id: true, screenshotKey: true } });
    if (!payment?.screenshotKey) throw new NotFoundException('No screenshot for this payment');
    const extension = payment.screenshotKey.split('.').pop() ?? 'png';
    const type = Object.entries(SCREENSHOT_TYPES).find(([, ext]) => ext === extension)?.[0] ?? 'image/png';
    return { buffer: await readFile(join(this.screenshotDir, payment.screenshotKey)), type };
  }

  async approve(id: string, adminEmail: string, note?: string): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, { where: { id } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'pending') throw new ConflictException(`This payment is already ${payment.status}.`);
      payment.status = 'approved';
      payment.adminNote = note?.trim() || null;
      payment.reviewedBy = adminEmail;
      payment.reviewedAt = new Date();
      await manager.save(payment);
      await manager.update(User, { id: payment.userId }, { plan: 'lifetime', planActivatedAt: new Date() });
      return payment;
    });
  }

  async reject(id: string, adminEmail: string, note?: string): Promise<Payment> {
    const payment = await this.payments.findOneBy({ id });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'pending') throw new ConflictException(`This payment is already ${payment.status}.`);
    payment.status = 'rejected';
    payment.adminNote = note?.trim() || 'Payment could not be verified.';
    payment.reviewedBy = adminEmail;
    payment.reviewedAt = new Date();
    return this.payments.save(payment);
  }

  async stats() {
    const [totalUsers, lifetimeUsers, pending, approved, revenue, newUsers] = await Promise.all([
      this.users.count(),
      this.users.countBy({ plan: 'lifetime' }),
      this.payments.countBy({ status: 'pending' }),
      this.payments.countBy({ status: 'approved' }),
      this.payments
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where("p.status = 'approved'")
        .getRawOne<{ total: string }>(),
      this.users
        .createQueryBuilder('u')
        .where("u.createdAt >= NOW() - INTERVAL '24 hours'")
        .getCount(),
    ]);
    return {
      totalUsers,
      lifetimeUsers,
      pendingPayments: pending,
      approvedPayments: approved,
      revenue: Number(revenue?.total ?? 0),
      currency: this.config.currency,
      newUsers24h: newUsers,
    };
  }

  listUsers(search?: string) {
    const query = this.users
      .createQueryBuilder('u')
      .select(['u.id', 'u.email', 'u.fullName', 'u.plan', 'u.planActivatedAt', 'u.createdAt'])
      .orderBy('u.createdAt', 'DESC')
      .take(100);
    if (search?.trim()) {
      query.where('(u.email ILIKE :term OR u.fullName ILIKE :term)', { term: `%${search.trim()}%` });
    }
    return query.getMany();
  }

  async setPlan(userId: string, plan: UserPlan) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    await this.users.update({ id: userId }, { plan, planActivatedAt: plan === 'lifetime' ? new Date() : null });
    return { id: userId, plan };
  }
}
