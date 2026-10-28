-- CreateEnum
CREATE TYPE "book_status" AS ENUM ('PUBLISHED', 'IN_PRODUCTION');

-- CreateEnum
CREATE TYPE "production_stage" AS ENUM ('MANUSCRIPT_RECEIVED', 'EDITING', 'COVER_DESIGN', 'TYPESETTING', 'PROOFREADING', 'ISBN_ASSIGNMENT', 'PRINTING', 'DISTRIBUTION_SETUP');

-- CreateEnum
CREATE TYPE "print_partner" AS ENUM ('IN_HOUSE', 'REPRO_INDIA', 'EPITOME_BOOKS');

-- CreateEnum
CREATE TYPE "platform" AS ENUM ('AMAZON_IN', 'FLIPKART', 'AMAZON_US', 'AMAZON_UK', 'BOOKLEAF_STORE');

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "isbn" VARCHAR(32),
    "genre" VARCHAR(120) NOT NULL,
    "status" "book_status" NOT NULL,
    "production_stage" "production_stage",
    "publication_date" DATE,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "mrp_minor" INTEGER,
    "royalty_per_copy_minor" INTEGER,
    "copies_sold" INTEGER NOT NULL DEFAULT 0,
    "royalty_earned_minor" INTEGER NOT NULL DEFAULT 0,
    "royalty_paid_minor" INTEGER NOT NULL DEFAULT 0,
    "royalty_pending_minor" INTEGER NOT NULL DEFAULT 0,
    "last_payout_date" DATE,
    "print_partner" "print_partner",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_platforms" (
    "book_id" UUID NOT NULL,
    "platform" "platform" NOT NULL,

    CONSTRAINT "book_platforms_pkey" PRIMARY KEY ("book_id","platform")
);

-- CreateIndex
CREATE UNIQUE INDEX "books_code_key" ON "books"("code");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_author_id_idx" ON "books"("author_id");

-- CreateIndex
CREATE INDEX "book_platforms_platform_idx" ON "book_platforms"("platform");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_platforms" ADD CONSTRAINT "book_platforms_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "books" ADD CONSTRAINT "books_royalty_balance_check"
  CHECK ("royalty_earned_minor" = "royalty_paid_minor" + "royalty_pending_minor");

ALTER TABLE "books" ADD CONSTRAINT "books_non_negative_check" CHECK (
  "copies_sold" >= 0
  AND "royalty_earned_minor" >= 0
  AND "royalty_paid_minor" >= 0
  AND "royalty_pending_minor" >= 0
  AND ("mrp_minor" IS NULL OR "mrp_minor" >= 0)
  AND ("royalty_per_copy_minor" IS NULL OR "royalty_per_copy_minor" >= 0)
);

ALTER TABLE "books" ADD CONSTRAINT "books_stage_matches_status_check"
  CHECK (("status" = 'IN_PRODUCTION') = ("production_stage" IS NOT NULL));
