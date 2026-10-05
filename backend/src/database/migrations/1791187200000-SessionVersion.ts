import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * users.tokenVersion: login tokens carry it, so changing the password (or "sign out everywhere")
 * ends every other session. Existing tokens have none, which counts as 0 — nobody is signed out
 * by this migration.
 */
export class SessionVersion1791187200000 implements MigrationInterface {
  name = 'SessionVersion1791187200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tokenVersion"`);
  }
}
