CREATE TABLE "GlobalField" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "visibility" "FieldVisibility" NOT NULL DEFAULT 'INTERNAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalField_name_key" ON "GlobalField"("name");
