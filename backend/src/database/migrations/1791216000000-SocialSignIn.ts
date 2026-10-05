import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sign in with Google / Apple: linked provider accounts (user_identities), password-less users
 * (passwordHash nullable) and users.emailVerifiedAt. Idempotent, with TypeORM's generated names;
 * the new table is closed to Supabase's Data API like every other table.
 */
export class SocialSignIn1791216000000 implements MigrationInterface {
  name = 'SocialSignIn1791216000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP WITH TIME ZONE`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_identities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "provider" character varying(20) NOT NULL,
        "subject" character varying(255) NOT NULL,
        "email" character varying(160),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_e23bff04e9c3e7b785e442b262c" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_084cef3785217102f222e90ea7" ON "user_identities" ("userId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ad3f47ebbf0a5521265b4ea2c2" ON "user_identities" ("provider", "subject")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_084cef3785217102f222e90ea7c' AND conrelid = '"user_identities"'::regclass) THEN
          ALTER TABLE "user_identities" ADD CONSTRAINT "FK_084cef3785217102f222e90ea7c" FOREIGN KEY ("userId")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$`);

    await queryRunner.query(`ALTER TABLE "user_identities" ENABLE ROW LEVEL SECURITY`);
    // anon / authenticated only exist on Supabase; plain PostgreSQL skips this block.
    await queryRunner.query(`
      DO $$ DECLARE api_role text;
      BEGIN
        FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE "user_identities" FROM %I', api_role);
          END IF;
        END LOOP;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_identities"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerifiedAt"`);
    // Password-less accounts get an unusable hash (no password matches it) so the column can be required again.
    await queryRunner.query(`UPDATE "users" SET "passwordHash" = '!' WHERE "passwordHash" IS NULL`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL`);
  }
}
