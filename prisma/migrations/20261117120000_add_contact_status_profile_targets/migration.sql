-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "status" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "targetRoles" TEXT;
ALTER TABLE "Profile" ADD COLUMN "targetLocations" TEXT;

-- CreateIndex
CREATE INDEX "Contact_createdBy_status_idx" ON "Contact"("createdBy", "status");
