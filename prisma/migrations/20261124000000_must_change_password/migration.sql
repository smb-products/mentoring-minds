-- Set when Vienne resets a password; cleared by families.changePassword.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
