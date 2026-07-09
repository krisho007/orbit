-- Track where a contact image came from and a content hash for change detection.
-- 'manual' images (user uploads / URL attaches) are never overwritten by a Google
-- import; 'google' images are only replaced when their bytes actually change.
ALTER TABLE "contact_images" ADD COLUMN "source" text NOT NULL DEFAULT 'manual';
ALTER TABLE "contact_images" ADD COLUMN "contentHash" text;

-- Backfill: the primary image (order 0) of any contact carrying the "Google Import"
-- tag was sourced from Google, so mark it as such. Manually-uploaded photos stay
-- 'manual' and remain protected. contentHash is left null and reconciled lazily on
-- the next import (identical bytes → hash filled in, no re-store).
UPDATE "contact_images" ci
SET "source" = 'google'
FROM "contact_tags" ct
JOIN "tags" t ON t."id" = ct."tagId"
WHERE ci."contactId" = ct."contactId"
  AND ci."order" = 0
  AND t."name" = 'Google Import';
