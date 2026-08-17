-- AddColumn (nullable first, to backfill existing rows)
ALTER TABLE "users" ADD COLUMN "uid" TEXT;

-- Backfill existing rows with a random 12-digit uid
UPDATE "users" SET "uid" = lpad(floor(random() * 1000000000000)::text, 12, '0') WHERE "uid" IS NULL;

-- Enforce NOT NULL now that every row has a value
ALTER TABLE "users" ALTER COLUMN "uid" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_uid_key" ON "users"("uid");
