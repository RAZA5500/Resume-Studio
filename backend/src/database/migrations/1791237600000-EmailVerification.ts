import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email verification: one open code + link per account. Idempotent, with TypeORM's generated
 * names; closed to Supabase's Data API like every other table.
 */
export class EmailVerification1791237600000 implements MigrationInterface {
  name = 'EmailVerification1791237600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_verifications" (
        "userId" uuid NOT NULL,
        "codeHash" character varying(64) NOT NULL,
        "linkHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sendCount" integer NOT NULL DEFAULT 1,
        "windowStart" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_4e63a91e0a684b31496bd50733e" PRIMARY KEY ("userId")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_f40eb538268691fcbd6249f7ab" ON "email_verifications" ("linkHash")`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_4e63a91e0a684b31496bd50733e' AND conrelid = '"email_verifications"'::regclass) THEN
          ALTER TABLE "email_verifications" ADD CONSTRAINT "FK_4e63a91e0a684b31496bd50733e" FOREIGN KEY ("userId")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$`);

    await queryRunner.query(`ALTER TABLE "email_verifications" ENABLE ROW LEVEL SECURITY`);
    // anon / authenticated only exist on Supabase; plain PostgreSQL skips this block.
    await queryRunner.query(`
      DO $$ DECLARE api_role text;
      BEGIN
        FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE "email_verifications" FROM %I', api_role);
          END IF;
        END LOOP;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verifications"`);
  }
}
