-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "googleContactName" TEXT;

-- CreateIndex
CREATE INDEX "contacts_userId_googleContactName_idx" ON "contacts"("userId", "googleContactName");
