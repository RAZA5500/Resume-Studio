import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['users', 'templates', 'resumes', 'documents', 'usage_events', 'payments', 'ats_reports'];

/** [table, constraint name] — every child table references users(id) and is deleted with its user. */
const USER_FOREIGN_KEYS: [string, string][] = [
  ['resumes', 'FK_339097f7bb65e85c34f033df05b'],
  ['documents', 'FK_e300b5c2e3fefa9d6f8a3f25975'],
  ['usage_events', 'FK_a2ce1943b88adcacb77be3d4d16'],
  ['payments', 'FK_d35cb3c13a18e1ea1705b2817b1'],
  ['ats_reports', 'FK_8ea3429301793773144194d4f2e'],
];

/**
 * The complete schema of ResumeStudio.
 *
 * Every statement is idempotent and uses exactly the names TypeORM generates, so the migration also
 * adopts a database whose tables were created earlier by `synchronize` (it then only records itself).
 *
 * Supabase exposes every table in "public" through its Data API (PostgREST) to anyone holding the
 * project's anon key. The backend connects as the table owner, which row level security does not
 * restrict, so RLS without policies (plus revoking the API roles' grants) closes that door completely.
 */
export class InitialSchema1790942400000 implements MigrationInterface {
  name = 'InitialSchema1790942400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(160) NOT NULL,
        "passwordHash" character varying(100) NOT NULL,
        "fullName" character varying(120) NOT NULL,
        "headline" character varying(160),
        "plan" character varying(20) NOT NULL DEFAULT 'free',
        "planActivatedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "templates" (
        "id" character varying(120) NOT NULL,
        "name" character varying(160) NOT NULL,
        "description" text NOT NULL,
        "layout" character varying(40) NOT NULL,
        "category" character varying(40) NOT NULL,
        "tags" text array NOT NULL DEFAULT '{}',
        "atsFriendly" boolean NOT NULL DEFAULT true,
        "columns" smallint NOT NULL DEFAULT '1',
        "hasPhoto" boolean NOT NULL DEFAULT false,
        "paletteKey" character varying(40) NOT NULL,
        "colorFamily" character varying(40) NOT NULL,
        "fontKey" character varying(40) NOT NULL,
        "popularity" integer NOT NULL DEFAULT '0',
        "usageCount" integer NOT NULL DEFAULT '0',
        "featured" boolean NOT NULL DEFAULT false,
        "catalogVersion" integer NOT NULL DEFAULT '1',
        "config" jsonb NOT NULL,
        CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e3c573e504ad7e250f29f70167" ON "templates" ("layout")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_acbbebfff1589d706faed9fae8" ON "templates" ("atsFriendly")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_458ca9d570ccccb39f41eefd4b" ON "templates" ("colorFamily")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_94d83cbc185323b62a83a0ce77" ON "templates" ("fontKey")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resumes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "title" character varying(160) NOT NULL,
        "templateId" character varying(120),
        "content" jsonb NOT NULL,
        "design" jsonb NOT NULL,
        "atsScore" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_9c8677802096d6baece48429d2e" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_339097f7bb65e85c34f033df05" ON "resumes" ("userId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "kind" character varying(20) NOT NULL,
        "sourceFormat" character varying(12),
        "originalName" character varying(255),
        "mimeType" character varying(120),
        "size" integer NOT NULL DEFAULT '0',
        "storageKey" character varying(120),
        "editorState" jsonb,
        "thumbnail" text,
        "pageCount" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e300b5c2e3fefa9d6f8a3f2597" ON "documents" ("userId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "usage_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "kind" character varying(20) NOT NULL,
        "day" character varying(10) NOT NULL,
        "resourceId" character varying(64),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_c9f17d50873fab2c46615f542bc" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_08a7f5dc0ea3e1b7af96a599be" ON "usage_events" ("userId", "kind", "day")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "plan" character varying(20) NOT NULL DEFAULT 'lifetime',
        "amount" integer NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'PKR',
        "method" character varying(20) NOT NULL,
        "transactionId" character varying(64) NOT NULL,
        "senderNumber" character varying(40) NOT NULL,
        "senderName" character varying(120),
        "screenshotKey" character varying(120),
        "hasScreenshot" boolean NOT NULL DEFAULT false,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "adminNote" text,
        "reviewedBy" character varying(160),
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_d35cb3c13a18e1ea1705b2817b" ON "payments" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_32b41cdb985a296213e9a928b5" ON "payments" ("status")`);
    // A transaction ID can be submitted again only after its earlier payment was rejected.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_7df75adb690c31784b1d5ebdd1" ON "payments" ("method", "transactionId") WHERE "status" <> 'rejected'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ats_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "resumeId" uuid,
        "sourceType" character varying(20) NOT NULL,
        "fileName" character varying(255),
        "jobTitle" character varying(160),
        "jobDescription" text,
        "extractedText" text NOT NULL,
        "score" integer NOT NULL,
        "grade" character varying(20) NOT NULL,
        "result" jsonb NOT NULL,
        "aiAnalysis" jsonb,
        "aiScore" integer,
        "warnings" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_4bde747a71e2a0ccacaca975ffc" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_8ea3429301793773144194d4f2" ON "ats_reports" ("userId")`);

    for (const [table, constraint] of USER_FOREIGN_KEYS) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}' AND conrelid = '"${table}"'::regclass) THEN
            ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("userId")
              REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
          END IF;
        END $$`);
    }

    const tables = [...TABLES, queryRunner.dataSource.options.migrationsTableName ?? 'migrations'];
    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    // anon / authenticated only exist on Supabase; plain PostgreSQL skips this block.
    await queryRunner.query(`
      DO $$ DECLARE api_role text;
      BEGIN
        FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE ${tables.map((t) => `"${t}"`).join(', ')} FROM %I', api_role);
          END IF;
        END LOOP;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Foreign keys and indexes go with their tables.
    await queryRunner.query(`DROP TABLE IF EXISTS ${[...TABLES].reverse().map((t) => `"${t}"`).join(', ')}`);
  }
}
