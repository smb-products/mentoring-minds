-- Bumped on password change/reset; sessions carrying an older version are signed out.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
