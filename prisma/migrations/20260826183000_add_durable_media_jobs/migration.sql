ALTER TABLE "AgentMessage"
ADD COLUMN "mediaUrl" TEXT,
ADD COLUMN "mediaStatus" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN "mediaStartedAt" TIMESTAMP(3),
ADD COLUMN "mediaLeaseToken" TEXT,
ADD COLUMN "mediaAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mediaError" TEXT;

CREATE INDEX "AgentMessage_mediaStatus_receivedAt_idx" ON "AgentMessage"("mediaStatus", "receivedAt");

ALTER TABLE "AgentHandoffEvent"
ADD COLUMN "dispatchStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "dispatchStartedAt" TIMESTAMP(3),
ADD COLUMN "dispatchToken" TEXT,
ADD COLUMN "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextDispatchAt" TIMESTAMP(3),
ADD COLUMN "deliveryState" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "AgentHandoffEvent_dispatchStatus_createdAt_idx" ON "AgentHandoffEvent"("dispatchStatus", "createdAt");

ALTER TABLE "AgentMessageBatch"
ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "deliveryStartedAt" TIMESTAMP(3),
ADD COLUMN "deliveryToken" TEXT;
