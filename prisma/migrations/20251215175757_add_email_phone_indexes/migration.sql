-- CreateIndex
CREATE INDEX "contacts_userId_primaryEmail_idx" ON "contacts"("userId", "primaryEmail");

-- CreateIndex
CREATE INDEX "contacts_userId_primaryPhone_idx" ON "contacts"("userId", "primaryPhone");
