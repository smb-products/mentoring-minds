-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "inviteRequestId" TEXT;

-- CreateTable
CREATE TABLE "InviteRequest" (
    "id" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "grade" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteRequest_createdAt_idx" ON "InviteRequest"("createdAt");

-- CreateIndex
CREATE INDEX "InviteRequest_email_createdAt_idx" ON "InviteRequest"("email", "createdAt");

-- CreateIndex
CREATE INDEX "InviteRequest_ipHash_createdAt_idx" ON "InviteRequest"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_inviteRequestId_idx" ON "Notification"("inviteRequestId");
