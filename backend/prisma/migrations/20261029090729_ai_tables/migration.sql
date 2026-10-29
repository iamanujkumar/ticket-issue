-- CreateEnum
CREATE TYPE "draft_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "draft_usage" AS ENUM ('UNCHANGED', 'EDITED');

-- CreateEnum
CREATE TYPE "ai_task" AS ENUM ('TRIAGE', 'DRAFT');

-- CreateEnum
CREATE TYPE "ai_outcome" AS ENUM ('SUCCESS', 'INVALID_OUTPUT', 'RATE_LIMITED', 'TIMEOUT', 'PROVIDER_ERROR', 'CIRCUIT_OPEN', 'DISABLED');

-- CreateTable
CREATE TABLE "ai_drafts" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "status" "draft_status" NOT NULL DEFAULT 'PENDING',
    "content" TEXT,
    "internal_hints" JSONB NOT NULL DEFAULT '[]',
    "based_on_message_id" UUID,
    "category_at_generation" "ticket_category" NOT NULL,
    "model" VARCHAR(80),
    "prompt_version" VARCHAR(20) NOT NULL,
    "instructions" VARCHAR(300),
    "requested_by" UUID,
    "error_code" VARCHAR(40),
    "usage" "draft_usage",
    "sent_message_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_invocations" (
    "id" UUID NOT NULL,
    "ticket_id" UUID,
    "task" "ai_task" NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "prompt_version" VARCHAR(20) NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "estimated_cost_usd" DECIMAL(12,6),
    "outcome" "ai_outcome" NOT NULL,
    "error_message" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_drafts_sent_message_id_key" ON "ai_drafts"("sent_message_id");

-- CreateIndex
CREATE INDEX "ai_drafts_ticket_id_created_at_idx" ON "ai_drafts"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_invocations_ticket_id_created_at_idx" ON "ai_invocations"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_invocations_created_at_idx" ON "ai_invocations"("created_at");

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_sent_message_id_fkey" FOREIGN KEY ("sent_message_id") REFERENCES "ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_ready_has_content_check"
  CHECK ("status" <> 'READY' OR "content" IS NOT NULL);

ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_usage_needs_message_check"
  CHECK (("usage" IS NULL) = ("sent_message_id" IS NULL));
