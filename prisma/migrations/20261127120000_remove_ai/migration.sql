-- AlterEnum
BEGIN;
CREATE TYPE "KeySource_new" AS ENUM ('TYPED');
ALTER TABLE "public"."BookItem" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "BookItem" ALTER COLUMN "source" TYPE "KeySource_new" USING ("source"::text::"KeySource_new");
ALTER TYPE "KeySource" RENAME TO "KeySource_old";
ALTER TYPE "KeySource_new" RENAME TO "KeySource";
DROP TYPE "public"."KeySource_old";
ALTER TABLE "BookItem" ALTER COLUMN "source" SET DEFAULT 'TYPED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NoteSource_new" AS ENUM ('TYPED');
ALTER TABLE "public"."SessionNote" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "SessionNote" ALTER COLUMN "source" TYPE "NoteSource_new" USING ("source"::text::"NoteSource_new");
ALTER TYPE "NoteSource" RENAME TO "NoteSource_old";
ALTER TYPE "NoteSource_new" RENAME TO "NoteSource";
DROP TYPE "public"."NoteSource_old";
ALTER TABLE "SessionNote" ALTER COLUMN "source" SET DEFAULT 'TYPED';
COMMIT;

-- DropTable
DROP TABLE "AiDraft";

-- DropEnum
DROP TYPE "DraftKind";

-- DropEnum
DROP TYPE "DraftStatus";

