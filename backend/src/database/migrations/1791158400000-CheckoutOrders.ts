import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Online checkout: the checkout_orders table (one row per gateway payment attempt) and the payments
 * ledger columns that gateway payments need. Idempotent, with TypeORM's generated names, like
 * InitialSchema; the new table is closed to Supabase's Data API in the same way.
 */
export class CheckoutOrders1791158400000 implements MigrationInterface {
  name = 'CheckoutOrders1791158400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider" character varying(30)`);
    // A gateway does not always report the wallet number or card a payment came from.
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "senderNumber" DROP NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "checkout_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "plan" character varying(20) NOT NULL DEFAULT 'lifetime',
        "amount" integer NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'PKR',
        "provider" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'created',
        "providerRef" character varying(120),
        "action" jsonb,
        "transactionId" character varying(64),
        "paymentId" uuid,
        "failureReason" text,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_30e864f6a10037f8bfeaba17024" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_08aa1aae648b7de5802deb3169" ON "checkout_orders" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_3c77b31ad8655bf8dc7b749ce8" ON "checkout_orders" ("status")`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_08aa1aae648b7de5802deb31693' AND conrelid = '"checkout_orders"'::regclass) THEN
          ALTER TABLE "checkout_orders" ADD CONSTRAINT "FK_08aa1aae648b7de5802deb31693" FOREIGN KEY ("userId")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$`);

    await queryRunner.query(`ALTER TABLE "checkout_orders" ENABLE ROW LEVEL SECURITY`);
    // anon / authenticated only exist on Supabase; plain PostgreSQL skips this block.
    await queryRunner.query(`
      DO $$ DECLARE api_role text;
      BEGIN
        FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE "checkout_orders" FROM %I', api_role);
          END IF;
        END LOOP;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "checkout_orders"`);
    // Gateway payments may have no sender number; keep those ledger rows, just with an empty one.
    await queryRunner.query(`UPDATE "payments" SET "senderNumber" = '' WHERE "senderNumber" IS NULL`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "senderNumber" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "provider"`);
  }
}
