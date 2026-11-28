-- J2 (S36 §1): new accounts are ACTIVE. Only the default changes: no row is updated, and old PREVIEW rows stay PREVIEW.
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
