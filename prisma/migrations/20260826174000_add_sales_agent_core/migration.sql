CREATE TYPE "MeetingMode" AS ENUM ('ONLINE', 'FACE_TO_FACE');
CREATE TYPE "MeetingPlatform" AS ENUM ('GOOGLE_MEET', 'ZOOM', 'DISCORD');
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'CANCELLED', 'SENT');

CREATE TABLE "AgentConfigurationDraft" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "persona" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentConfigurationDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentConfigurationVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "persona" TEXT NOT NULL,
    "sourceDraftId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentConfigurationVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMessageBatch" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "flushAt" TIMESTAMP(3) NOT NULL,
    "combinedInput" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    CONSTRAINT "AgentMessageBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    "batchId" TEXT,
    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingReservation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "mode" "MeetingMode" NOT NULL,
    "platform" "MeetingPlatform",
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentFollowUp" (
    "id" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "conversationId" TEXT NOT NULL,
    CONSTRAINT "AgentFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentHandoffEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "AgentHandoffEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentConfigurationVersion_version_key" ON "AgentConfigurationVersion"("version");
CREATE UNIQUE INDEX "AgentConversation_channel_customerId_key" ON "AgentConversation"("channel", "customerId");
CREATE UNIQUE INDEX "AgentMessage_conversationId_sourceMessageId_key" ON "AgentMessage"("conversationId", "sourceMessageId");
CREATE INDEX "AgentMessage_conversationId_occurredAt_idx" ON "AgentMessage"("conversationId", "occurredAt");
CREATE INDEX "AgentMessageBatch_status_flushAt_idx" ON "AgentMessageBatch"("status", "flushAt");
CREATE UNIQUE INDEX "MeetingReservation_startsAt_key" ON "MeetingReservation"("startsAt");
CREATE UNIQUE INDEX "AgentFollowUp_conversationId_stage_key" ON "AgentFollowUp"("conversationId", "stage");
CREATE INDEX "AgentFollowUp_status_dueAt_idx" ON "AgentFollowUp"("status", "dueAt");
CREATE UNIQUE INDEX "AgentHandoffEvent_idempotencyKey_key" ON "AgentHandoffEvent"("idempotencyKey");
CREATE INDEX "AgentHandoffEvent_type_createdAt_idx" ON "AgentHandoffEvent"("type", "createdAt");

ALTER TABLE "AgentMessageBatch" ADD CONSTRAINT "AgentMessageBatch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AgentMessageBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentFollowUp" ADD CONSTRAINT "AgentFollowUp_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AgentConfigurationDraft" ("id", "persona", "createdAt", "updatedAt")
SELECT 'current', "content", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "GlobalField"
WHERE LOWER("name") LIKE '%tone%' OR LOWER("name") LIKE '%voice%' OR LOWER("name") LIKE '%prompt%'
ORDER BY "position" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AgentConfigurationVersion" ("id", "version", "persona", "sourceDraftId", "publishedAt")
SELECT CONCAT('bootstrap-', MD5("persona")), 1, "persona", "id", CURRENT_TIMESTAMP
FROM "AgentConfigurationDraft"
WHERE "id" = 'current' AND LENGTH(TRIM("persona")) > 0
ON CONFLICT ("version") DO NOTHING;
