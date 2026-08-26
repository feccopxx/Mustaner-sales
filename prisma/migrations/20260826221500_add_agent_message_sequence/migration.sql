ALTER TABLE "AgentConversation"
ADD COLUMN "inboundSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastInboundSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentMessage"
ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AgentMessage_conversationId_sequence_idx" ON "AgentMessage"("conversationId", "sequence");
