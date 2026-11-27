-- CreateTable
CREATE TABLE "InviteAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteAttempt_createdAt_idx" ON "InviteAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "InviteAttempt_ipHash_createdAt_idx" ON "InviteAttempt"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "InviteAttempt_requestId_idx" ON "InviteAttempt"("requestId");

-- AddForeignKey
ALTER TABLE "InviteAttempt" ADD CONSTRAINT "InviteAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InviteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
