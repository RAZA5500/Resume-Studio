-- =============================================================================
-- Resume-Studio Supabase Database Schema
-- Run this in the Supabase Dashboard -> SQL Editor (or let TypeORM DB_SYNC do it)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users
CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(160) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(100) NOT NULL,
  "fullName" VARCHAR(120) NOT NULL,
  "headline" VARCHAR(160),
  "plan" VARCHAR(20) NOT NULL DEFAULT 'free',
  "planActivatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "users" (LOWER("email"));

-- 2. Templates
CREATE TABLE IF NOT EXISTS "templates" (
  "id" VARCHAR(120) PRIMARY KEY,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT NOT NULL,
  "layout" VARCHAR(40) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "atsFriendly" BOOLEAN NOT NULL DEFAULT true,
  "columns" SMALLINT NOT NULL DEFAULT 1,
  "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
  "paletteKey" VARCHAR(40) NOT NULL,
  "colorFamily" VARCHAR(40) NOT NULL,
  "fontKey" VARCHAR(40) NOT NULL,
  "popularity" INTEGER NOT NULL DEFAULT 0,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "catalogVersion" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_templates_layout" ON "templates" ("layout");
CREATE INDEX IF NOT EXISTS "IDX_templates_atsFriendly" ON "templates" ("atsFriendly");
CREATE INDEX IF NOT EXISTS "IDX_templates_colorFamily" ON "templates" ("colorFamily");
CREATE INDEX IF NOT EXISTS "IDX_templates_fontKey" ON "templates" ("fontKey");

-- 3. Resumes
CREATE TABLE IF NOT EXISTS "resumes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" VARCHAR(160) NOT NULL,
  "templateId" VARCHAR(120),
  "content" JSONB NOT NULL,
  "design" JSONB NOT NULL,
  "atsScore" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_resumes_userId" ON "resumes" ("userId");

-- 4. Documents (PDFs, Images, Word files, Canvas)
CREATE TABLE IF NOT EXISTS "documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" VARCHAR(200) NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "sourceFormat" VARCHAR(12),
  "originalName" VARCHAR(255),
  "mimeType" VARCHAR(120),
  "size" INTEGER NOT NULL DEFAULT 0,
  "storageKey" VARCHAR(120),
  "editorState" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_documents_userId" ON "documents" ("userId");

-- 5. Usage Events (Rate-limiting daily allowances for free users)
CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" VARCHAR(20) NOT NULL,
  "day" VARCHAR(10) NOT NULL,
  "resourceId" VARCHAR(64),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_usage_events_lookup" ON "usage_events" ("userId", "kind", "day");

-- 6. Payments (Manual JazzCash, Easypaisa, Bank transfer receipts)
CREATE TABLE IF NOT EXISTS "payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan" VARCHAR(20) NOT NULL DEFAULT 'lifetime',
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
  "method" VARCHAR(20) NOT NULL,
  "transactionId" VARCHAR(64) NOT NULL,
  "senderNumber" VARCHAR(40) NOT NULL,
  "senderName" VARCHAR(120),
  "screenshotKey" VARCHAR(120),
  "hasScreenshot" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "reviewedAt" TIMESTAMPTZ,
  "reviewerEmail" VARCHAR(160),
  "adminNotes" VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_payments_userId" ON "payments" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payments_unique_tx" ON "payments" ("method", "transactionId") WHERE "status" <> 'rejected';

-- 7. ATS Reports
CREATE TABLE IF NOT EXISTS "ats_reports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resumeId" UUID,
  "sourceType" VARCHAR(20) NOT NULL,
  "fileName" VARCHAR(255),
  "jobTitle" VARCHAR(160),
  "jobDescription" TEXT,
  "extractedText" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "grade" VARCHAR(20) NOT NULL,
  "result" JSONB NOT NULL,
  "aiAnalysis" JSONB,
  "aiScore" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_ats_reports_userId" ON "ats_reports" ("userId");
