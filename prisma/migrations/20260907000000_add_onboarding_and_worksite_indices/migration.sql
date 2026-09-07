-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "onboarding_skipped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "onboarding_step" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "worksites_organization_id_idx" ON "worksites"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "worksites_branch_id_idx" ON "worksites"("branch_id");
