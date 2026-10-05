import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refresh tokens (one row per token, rotated on every refresh). Idempotent, with TypeORM's
 * generated names; closed to Supabase's Data API like every other table.
 */
export class RefreshTokens1791244800000 implements MigrationInterface {
  name = 'RefreshTokens1791244800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "familyId" uuid NOT NULL,
        "tokenVersion" integer NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_40e9a8b923a1b3fb4429a5c624" ON "refresh_tokens" ("familyId")`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_610102b60fea1455310ccd299de' AND conrelid = '"refresh_tokens"'::regclass) THEN
          ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$`);

    await queryRunner.query(`ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY`);
    // anon / authenticated only exist on Supabase; plain PostgreSQL skips this block.
    await queryRunner.query(`
      DO $$ DECLARE api_role text;
      BEGIN
        FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE "refresh_tokens" FROM %I', api_role);
          END IF;
        END LOOP;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
