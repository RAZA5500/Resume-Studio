import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Two-factor sign-in with an authenticator app: the (encrypted) secret, when it was turned on, replay guard and backup codes. */
export class TwoFactor1791230400000 implements MigrationInterface {
  name = 'TwoFactor1791230400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabledAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorLastStep" integer`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['twoFactorBackupCodes', 'twoFactorLastStep', 'twoFactorEnabledAt', 'twoFactorSecret']) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
