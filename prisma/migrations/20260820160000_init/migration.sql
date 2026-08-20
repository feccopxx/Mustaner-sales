CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "FieldVisibility" AS ENUM ('PUBLIC', 'INTERNAL');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'PDF', 'VIDEO', 'DOCUMENT', 'OTHER');

CREATE TABLE "AppConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Course" (
  "id" VARCHAR(64) NOT NULL,
  "name" TEXT NOT NULL,
  "shortDescription" TEXT NOT NULL DEFAULT '',
  "price" TEXT NOT NULL DEFAULT '',
  "curriculum" TEXT NOT NULL DEFAULT '',
  "howToSell" TEXT NOT NULL DEFAULT '',
  "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomField" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "visibility" "FieldVisibility" NOT NULL DEFAULT 'INTERNAL',
  "position" INTEGER NOT NULL DEFAULT 0,
  "courseId" TEXT NOT NULL,
  CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaLink" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" "MediaType" NOT NULL DEFAULT 'OTHER',
  "description" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL DEFAULT 0,
  "courseId" TEXT NOT NULL,
  CONSTRAINT "MediaLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseRevision" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Course_status_archivedAt_idx" ON "Course"("status", "archivedAt");
CREATE INDEX "Course_name_idx" ON "Course"("name");
CREATE UNIQUE INDEX "CustomField_courseId_name_key" ON "CustomField"("courseId", "name");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "CourseRevision_courseId_createdAt_idx" ON "CourseRevision"("courseId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRevision" ADD CONSTRAINT "CourseRevision_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
