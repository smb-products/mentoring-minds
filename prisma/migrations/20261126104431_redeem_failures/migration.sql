-- CreateTable
CREATE TABLE "RedeemFailure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedeemFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedeemFailure_at_idx" ON "RedeemFailure"("at");

-- AddForeignKey
ALTER TABLE "RedeemFailure" ADD CONSTRAINT "RedeemFailure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
