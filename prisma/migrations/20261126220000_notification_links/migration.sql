-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "studentId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_studentId_idx" ON "Notification"("studentId");

-- CreateIndex
CREATE INDEX "Notification_parentId_idx" ON "Notification"("parentId");
