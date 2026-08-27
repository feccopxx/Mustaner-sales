import express from 'express';
import type { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { agentBatchClaimSchema, agentConfigurationDraftSchema, agentDeliveryReconcileSchema, agentHandoffInputSchema, agentInboundMessageSchema, agentMeetingInputSchema, agentResponseInputSchema, courseInputSchema, globalFieldInputSchema } from './domain.js';
import { createApiKey, hashPassword, synchronizePasswordHash, verifyApiKey, verifyConfiguredApiKey, verifyPassword } from './security.js';
import { csrfGuard, issueSession, newCsrfToken, requireAdmin } from './auth.js';
import { projectCourse } from './course-projection.js';
import multer from 'multer';
import { createPdfAiClient, extractPdfCourseDraft, validatePdfUpload } from './pdf-import.js';
import { reserveMeeting } from './agent/booking.js';
import { createHandoffEvent } from './agent/handoff.js';
import { createSalesAiClient, generateSalesReply } from './agent/runtime.js';
import { publishAgentConfiguration } from './agent/configuration.js';
import { nextBatchFlushAt, normalizeInboundMessage } from './agent/inbound.js';
import { scheduleFollowUps } from './agent/follow-up.js';
import { classifyMessengerMedia, downloadMessengerMedia, parseMessengerWebhook, sendMessengerText, verifyMessengerSignature } from './integrations/messenger.js';
import { createOpenAiMediaClient, extractMediaMessage } from './integrations/media.js';
import { dispatchHumanAlert } from './integrations/notifications.js';
import { syncLeadToOdoo } from './integrations/odoo.js';

const include = { customFields: true, mediaLinks: true } as const;
const param = (value: string | string[]) => Array.isArray(value) ? value[0] : value;
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const mergeGlobalFields = async (customFields: Array<{ name: string; content: string; visibility: 'PUBLIC' | 'INTERNAL' }>) => {
  const templates = await prisma.globalField.findMany({ orderBy: { position: 'asc' } });
  const names = new Set(customFields.map(field => field.name.trim().toLocaleLowerCase()));
  return [...customFields, ...templates.filter(field => !names.has(field.name.trim().toLocaleLowerCase())).map(({ name, content, visibility }) => ({ name, content, visibility }))];
};
export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.use(cookieParser());
app.use('/api', csrfGuard);

const loginLimiter = rateLimit({ windowMs: 5 * 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, handler: (_req, res) => { res.status(429).json({ error: 'Too many login attempts. Try again in a few minutes.' }); } });

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/v1/integrations/messenger/webhook', (req, res) => {
  const valid = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.MESSENGER_VERIFY_TOKEN;
  if (!valid) return res.status(403).send('Forbidden');
  res.send(String(req.query['hub.challenge'] || ''));
});
app.get('/api/auth/session', requireAdmin, (_req, res) => res.json({ authenticated: true }));
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const bootstrap = process.env.APP_PASSWORD;
  if (!bootstrap) return res.status(503).json({ error: 'APP_PASSWORD is not configured' });
  let config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    config = await prisma.appConfig.create({ data: { id: 1, passwordHash: await hashPassword(bootstrap) } });
  } else {
    const passwordHash = await synchronizePasswordHash(config.passwordHash, bootstrap);
    if (passwordHash !== config.passwordHash) config = await prisma.appConfig.update({ where: { id: 1 }, data: { passwordHash } });
  }
  if (!(await verifyPassword(config.passwordHash, password))) return res.status(401).json({ error: 'Invalid password' });
  const csrf = newCsrfToken();
  res.cookie('mustaner_session', await issueSession(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 8 * 60 * 60_000 });
  res.cookie('mustaner_csrf', csrf, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 8 * 60 * 60_000 });
  res.json({ authenticated: true, csrf });
});
app.post('/api/auth/logout', requireAdmin, (_req, res) => { res.clearCookie('mustaner_session'); res.clearCookie('mustaner_csrf'); res.status(204).end(); });

app.get('/api/admin/courses', requireAdmin, async (req, res) => {
  const archived = req.query.archived === 'true';
  const courses = await prisma.course.findMany({ where: { archivedAt: archived ? { not: null } : null }, include, orderBy: { updatedAt: 'desc' } });
  res.json(courses);
});
app.post('/api/admin/courses', requireAdmin, async (req, res) => {
  const parsed = courseInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid course', issues: parsed.error.issues });
  const { customFields, mediaLinks, ...course } = parsed.data;
  try {
    const fields = await mergeGlobalFields(customFields);
    const created = await prisma.course.create({ data: { ...course, customFields: { create: fields.map((f, position) => ({ ...f, position })) }, mediaLinks: { create: mediaLinks.map((m, position) => ({ ...m, position })) } }, include });
    await prisma.auditLog.create({ data: { action: 'course.created', entityType: 'course', entityId: created.id } });
    res.status(201).json(created);
  } catch { res.status(409).json({ error: 'Course ID or custom field name already exists' }); }
});
app.get('/api/admin/global-fields', requireAdmin, async (_req, res) => res.json(await prisma.globalField.findMany({ orderBy: { position: 'asc' } })));
app.post('/api/admin/global-fields', requireAdmin, async (req, res) => {
  const parsed = globalFieldInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid global field', issues: parsed.error.issues });
  try {
    const position = await prisma.globalField.count();
    const field = await prisma.globalField.create({ data: { ...parsed.data, position } });
    await prisma.auditLog.create({ data: { action: 'global_field.created', entityType: 'global_field', entityId: field.id } });
    res.status(201).json(field);
  } catch { res.status(409).json({ error: 'A global field with this name already exists' }); }
});
app.put('/api/admin/global-fields/:id', requireAdmin, async (req, res) => {
  const parsed = globalFieldInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid global field', issues: parsed.error.issues });
  try {
    const field = await prisma.globalField.update({ where: { id: param(req.params.id) }, data: parsed.data });
    await prisma.auditLog.create({ data: { action: 'global_field.updated', entityType: 'global_field', entityId: field.id } });
    res.json(field);
  } catch { res.status(404).json({ error: 'Global field not found or name is already in use' }); }
});
app.delete('/api/admin/global-fields/:id', requireAdmin, async (req, res) => {
  try {
    const field = await prisma.globalField.delete({ where: { id: param(req.params.id) } });
    await prisma.auditLog.create({ data: { action: 'global_field.deleted', entityType: 'global_field', entityId: field.id } });
    res.status(204).end();
  } catch { res.status(404).json({ error: 'Global field not found' }); }
});
app.get('/api/admin/agent-config/draft', requireAdmin, async (_req, res) => {
  const draft = await prisma.agentConfigurationDraft.findUnique({ where: { id: 'current' } });
  res.json(draft || { id: 'current', persona: '' });
});
app.put('/api/admin/agent-config/draft', requireAdmin, async (req, res) => {
  const parsed = agentConfigurationDraftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid agent configuration', issues: parsed.error.issues });
  const draft = await prisma.agentConfigurationDraft.upsert({ where: { id: 'current' }, create: { id: 'current', ...parsed.data }, update: parsed.data });
  await prisma.auditLog.create({ data: { action: 'agent_config.draft_updated', entityType: 'agent_configuration', entityId: draft.id } });
  res.json(draft);
});
app.post('/api/admin/agent-config/publish', requireAdmin, async (_req, res) => {
  const draft = await prisma.agentConfigurationDraft.findUnique({ where: { id: 'current' } });
  if (!draft?.persona.trim()) return res.status(409).json({ error: 'Agent configuration draft is empty' });
  const published = await publishAgentConfiguration(draft, {
    latestVersion: async () => (await prisma.agentConfigurationVersion.aggregate({ _max: { version: true } }))._max.version || 0,
    publish: input => prisma.agentConfigurationVersion.create({ data: input }),
  });
  await prisma.auditLog.create({ data: { action: 'agent_config.published', entityType: 'agent_configuration', entityId: published.id, metadata: { version: published.version } } });
  res.status(201).json(published);
});
app.post('/api/admin/courses/import-pdf', requireAdmin, pdfUpload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF file to import' });
  try {
    validatePdfUpload(req.file);
    const apiKey = process.env.OPEN_AI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'OPEN_AI_API_KEY is not configured' });
    res.json(await extractPdfCourseDraft(req.file.buffer, req.file.originalname, createPdfAiClient(apiKey)));
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : 'The PDF could not be imported' });
  }
});
app.put('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  const courseId = param(req.params.id);
  const parsed = courseInputSchema.safeParse({ ...req.body, id: courseId });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid course', issues: parsed.error.issues });
  const existing = await prisma.course.findUnique({ where: { id: courseId }, include });
  if (!existing) return res.status(404).json({ error: 'Course not found' });
  const { customFields, mediaLinks, id: _id, ...course } = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.courseRevision.create({ data: { courseId: existing.id, snapshot: existing as never } });
    await tx.customField.deleteMany({ where: { courseId: existing.id } });
    await tx.mediaLink.deleteMany({ where: { courseId: existing.id } });
    return tx.course.update({ where: { id: existing.id }, data: { ...course, customFields: { create: customFields.map((f, position) => ({ ...f, position })) }, mediaLinks: { create: mediaLinks.map((m, position) => ({ ...m, position })) } }, include });
  });
  await prisma.auditLog.create({ data: { action: 'course.updated', entityType: 'course', entityId: updated.id } });
  res.json(updated);
});
app.post('/api/admin/courses/:id/archive', requireAdmin, async (req, res) => {
  const existing = await prisma.course.findUnique({ where: { id: param(req.params.id) }, include });
  if (!existing) return res.status(404).json({ error: 'Course not found' });
  await prisma.courseRevision.create({ data: { courseId: existing.id, snapshot: existing as never } });
  const course = await prisma.course.update({ where: { id: existing.id }, data: { archivedAt: new Date() }, include });
  await prisma.auditLog.create({ data: { action: 'course.archived', entityType: 'course', entityId: course.id } });
  res.json(course);
});
app.post('/api/admin/courses/:id/restore', requireAdmin, async (req, res) => {
  const course = await prisma.course.update({ where: { id: param(req.params.id) }, data: { archivedAt: null }, include });
  await prisma.auditLog.create({ data: { action: 'course.restored', entityType: 'course', entityId: course.id } });
  res.json(course);
});
app.get('/api/admin/courses/:id/revisions', requireAdmin, async (req, res) => res.json(await prisma.courseRevision.findMany({ where: { courseId: param(req.params.id) }, orderBy: { createdAt: 'desc' } })));
app.post('/api/admin/courses/:id/revisions/:revisionId/restore', requireAdmin, async (req, res) => {
  const courseId = param(req.params.id); const revisionId = param(req.params.revisionId);
  const revision = await prisma.courseRevision.findFirst({ where: { id: revisionId, courseId } });
  if (!revision) return res.status(404).json({ error: 'Revision not found' });
  const snapshot = revision.snapshot as Record<string, any>;
  const parsed = courseInputSchema.safeParse({ ...snapshot, customFields: snapshot.customFields || [], mediaLinks: snapshot.mediaLinks || [] });
  if (!parsed.success) return res.status(409).json({ error: 'Revision is incompatible' });
  req.body = parsed.data;
  const { customFields, mediaLinks, id: _id, ...data } = parsed.data;
  const restored = await prisma.$transaction(async (tx) => {
    await tx.customField.deleteMany({ where: { courseId } }); await tx.mediaLink.deleteMany({ where: { courseId } });
    return tx.course.update({ where: { id: courseId }, data: { ...data, customFields: { create: customFields.map((f, position) => ({ ...f, position })) }, mediaLinks: { create: mediaLinks.map((m, position) => ({ ...m, position })) } }, include });
  });
  await prisma.auditLog.create({ data: { action: 'course.revision_restored', entityType: 'course', entityId: restored.id, metadata: { revisionId: revision.id } } });
  res.json(restored);
});

app.get('/api/admin/api-keys', requireAdmin, async (_req, res) => res.json(await prisma.apiKey.findMany({ select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } })));
app.post('/api/admin/api-keys', requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim(); const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((s: unknown) => ['courses:read', 'sales-guidance:read', 'agent:read', 'agent:write'].includes(String(s))) : [];
  if (!name || !scopes.includes('courses:read')) return res.status(400).json({ error: 'Name and courses:read scope are required' });
  const generated = createApiKey(); const record = await prisma.apiKey.create({ data: { name, scopes, prefix: generated.prefix, keyHash: generated.hash } });
  await prisma.auditLog.create({ data: { action: 'api_key.created', entityType: 'api_key', entityId: record.id, metadata: { name, scopes } } });
  res.status(201).json({ id: record.id, name, scopes, key: generated.plaintext, warning: 'Copy this key now. It will not be shown again.' });
});
app.post('/api/admin/api-keys/:id/revoke', requireAdmin, async (req, res) => { const key = await prisma.apiKey.update({ where: { id: param(req.params.id) }, data: { revokedAt: new Date() } }); await prisma.auditLog.create({ data: { action: 'api_key.revoked', entityType: 'api_key', entityId: key.id } }); res.status(204).end(); });
app.get('/api/admin/audit', requireAdmin, async (_req, res) => res.json(await prisma.auditLog.findMany({ take: 200, orderBy: { createdAt: 'desc' } })));

async function apiAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const plaintext = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!plaintext) return res.status(401).json({ error: 'API key required' });
  if (verifyConfiguredApiKey(plaintext, process.env.MUSTANER_AGENT_API_KEY || '')) {
    res.locals.scopes = ['courses:read', 'sales-guidance:read', 'agent:read', 'agent:write'];
    return next();
  }
  const candidates = await prisma.apiKey.findMany({ where: { revokedAt: null } });
  const key = candidates.find((candidate) => verifyApiKey(plaintext, candidate.keyHash));
  if (!key) return res.status(401).json({ error: 'Invalid API key' });
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  res.locals.scopes = key.scopes; next();
}
const requireApiScope = (scope: string) => (_req: express.Request, res: express.Response, next: express.NextFunction) => res.locals.scopes.includes(scope) ? next() : res.status(403).json({ error: `${scope} scope required` });
app.get('/api/v1/courses', apiAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const courses = await prisma.course.findMany({ where: { status: 'PUBLISHED', archivedAt: null, ...(q ? { OR: [{ id: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { shortDescription: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, shortDescription: true, updatedAt: true }, orderBy: { name: 'asc' } });
  res.json({ data: courses, count: courses.length });
});
app.get('/api/v1/courses/:id', apiAuth, async (req, res) => {
  const course = await prisma.course.findFirst({ where: { id: param(req.params.id), status: 'PUBLISHED', archivedAt: null }, include: { customFields: true, mediaLinks: true } });
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const requestedSales = req.query.view === 'sales'; const allowedSales = res.locals.scopes.includes('sales-guidance:read');
  if (requestedSales && !allowedSales) return res.status(403).json({ error: 'sales-guidance:read scope required' });
  res.json(projectCourse(course, requestedSales && allowedSales));
});
app.get('/api/v1/agent/config', apiAuth, requireApiScope('agent:read'), async (_req, res) => {
  const published = await prisma.agentConfigurationVersion.findFirst({ orderBy: { version: 'desc' } });
  if (!published) return res.status(503).json({ error: 'Published agent configuration is unavailable' });
  res.json(published);
});
type PersistedInbound = { channel: string; customerId: string; sourceMessageId: string; kind: 'TEXT' | 'VOICE' | 'IMAGE' | 'PDF' | 'DOCX' | 'VIDEO' | 'OTHER'; text: string; mediaUrl?: string; occurredAt: string; receivedAt?: string };
const persistInboundMessage = async (input: PersistedInbound) => {
  const occurredAt = new Date(input.occurredAt);
  const receivedAt = process.env.NODE_ENV === 'test' && input.receivedAt ? new Date(input.receivedAt) : new Date();
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.channel}:${input.customerId}`}))`;
    const identity = { channel_customerId: { channel: input.channel, customerId: input.customerId } };
    let conversation = await tx.agentConversation.findUnique({ where: identity });
    if (conversation) {
      const duplicate = await tx.agentMessage.findUnique({ where: { conversationId_sourceMessageId: { conversationId: conversation.id, sourceMessageId: input.sourceMessageId } } });
      if (duplicate) return { duplicate: true as const };
      await tx.agentMessageBatch.updateMany({ where: { conversationId: conversation.id, status: { in: ['PROCESSING', 'GENERATING', 'READY_TO_SEND'] } }, data: { status: 'SUPERSEDED' } });
      const sequence = (conversation.inboundSequence || 0) + 1;
      conversation = await tx.agentConversation.update({ where: { id: conversation.id }, data: { lastInboundAt: receivedAt, inboundSequence: sequence, lastInboundSequence: sequence } });
    } else conversation = await tx.agentConversation.create({ data: { channel: input.channel, customerId: input.customerId, state: {}, lastInboundAt: receivedAt, inboundSequence: 1, lastInboundSequence: 1 } });
    const duplicate = await tx.agentMessage.findUnique({ where: { conversationId_sourceMessageId: { conversationId: conversation.id, sourceMessageId: input.sourceMessageId } } });
    if (duplicate) return { duplicate: true as const };
    await tx.agentFollowUp.updateMany({ where: { conversationId: conversation.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    const flushAt = nextBatchFlushAt(receivedAt);
    let batch = await tx.agentMessageBatch.findFirst({ where: { conversationId: conversation.id, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
    batch = batch ? await tx.agentMessageBatch.update({ where: { id: batch.id }, data: { flushAt } }) : await tx.agentMessageBatch.create({ data: { conversationId: conversation.id, flushAt } });
    await tx.agentMessage.create({ data: { conversationId: conversation.id, batchId: batch.id, sourceMessageId: input.sourceMessageId, kind: input.kind, normalizedText: input.mediaUrl ? '' : normalizeInboundMessage({ id: input.sourceMessageId, kind: input.kind, text: input.text, occurredAt }), occurredAt, receivedAt, sequence: conversation.lastInboundSequence || 1, mediaUrl: input.mediaUrl, mediaStatus: input.mediaUrl ? 'PENDING' : 'READY' } });
    return { duplicate: false as const, batch };
  });
};

export async function processPendingMediaJobs(limit = 4): Promise<number> {
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) return 0;
  const jobs = await prisma.agentMessage.findMany({ where: { OR: [{ mediaStatus: 'PENDING' }, { mediaStatus: 'PROCESSING', mediaStartedAt: { lte: new Date(Date.now() - 5 * 60_000) } }] }, orderBy: { receivedAt: 'asc' }, take: limit });
  const client = createOpenAiMediaClient(apiKey); let completed = 0;
  for (const job of jobs) {
    const leaseToken = randomUUID();
    const claimed = await prisma.agentMessage.updateMany({ where: { id: job.id, mediaStatus: job.mediaStatus, ...(job.mediaStatus === 'PROCESSING' ? { mediaStartedAt: job.mediaStartedAt } : {}) }, data: { mediaStatus: 'PROCESSING', mediaStartedAt: new Date(), mediaLeaseToken: leaseToken, mediaAttempts: { increment: 1 }, mediaError: null } });
    if (claimed.count !== 1 || !job.mediaUrl) continue;
    try {
      const media = await downloadMessengerMedia(job.mediaUrl);
      const kind = classifyMessengerMedia(job.kind as PersistedInbound['kind'], media.mimeType, media.filename);
      const text = await extractMediaMessage({ kind: kind === 'TEXT' ? 'OTHER' : kind, ...media }, client);
      await prisma.$transaction(async tx => {
        const won = await tx.agentMessage.updateMany({ where: { id: job.id, mediaStatus: 'PROCESSING', mediaLeaseToken: leaseToken }, data: { kind, normalizedText: text, mediaStatus: 'READY', mediaStartedAt: null, mediaLeaseToken: null } });
        if (won.count === 1 && job.batchId) await tx.agentMessageBatch.update({ where: { id: job.batchId }, data: { flushAt: nextBatchFlushAt(new Date()) } });
      });
      completed++;
    } catch (error) {
      const terminal = job.mediaAttempts + 1 >= 3;
      const fallback = `User sent a ${job.kind} with these details:\nThe media could not be processed after multiple attempts.\nA human team member should review the original attachment.`;
      await prisma.$transaction(async tx => {
        const won = await tx.agentMessage.updateMany({ where: { id: job.id, mediaStatus: 'PROCESSING', mediaLeaseToken: leaseToken }, data: { mediaStatus: terminal ? 'FAILED' : 'PENDING', normalizedText: terminal ? fallback : job.normalizedText, mediaStartedAt: null, mediaLeaseToken: null, mediaError: error instanceof Error ? error.message.slice(0, 2_000) : 'Media processing failed' } });
        if (won.count === 1 && terminal && job.batchId) await tx.agentMessageBatch.update({ where: { id: job.batchId }, data: { flushAt: nextBatchFlushAt(new Date()) } });
      });
    }
  }
  return completed;
}

app.post('/api/v1/integrations/messenger/webhook', async (req, res) => {
  const secret = process.env.MESSENGER_APP_SECRET || '';
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody || Buffer.alloc(0);
  if (!verifyMessengerSignature(rawBody, req.header('x-hub-signature-256'), secret)) return res.status(401).json({ error: 'Invalid Messenger signature' });
  const messages = parseMessengerWebhook(req.body);
  await Promise.all(messages.map(message => persistInboundMessage(message)));
  res.json({ status: 'ACCEPTED', count: messages.length });
  if (messages.some(message => message.mediaUrl)) setImmediate(() => { void processPendingMediaJobs().catch(() => undefined); });
});

app.post('/api/v1/agent/messages', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const parsed = agentInboundMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid inbound message', issues: parsed.error.issues });
  try {
    const result = await persistInboundMessage(parsed.data);
    if (result.duplicate) return res.json({ status: 'DUPLICATE' });
    res.status(202).json({ status: 'BUFFERED', batchId: result.batch.id, flushAt: result.batch.flushAt.toISOString() });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return res.json({ status: 'DUPLICATE' });
    throw error;
  }
});

export async function processPendingAgentBatches(limit = 4): Promise<number> {
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) return 0;
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const now = new Date();
    await prisma.agentMessageBatch.updateMany({ where: { status: 'GENERATING', generationStartedAt: { lte: new Date(now.getTime() - 5 * 60_000) } }, data: { status: 'OPEN', generationStartedAt: null, generationToken: null, flushAt: now } });
    const batch = await prisma.$transaction(async tx => {
      const candidate = await tx.agentMessageBatch.findFirst({ where: { status: 'OPEN', flushAt: { lte: now }, messages: { none: { mediaStatus: { in: ['PENDING', 'PROCESSING'] } } } }, include: { conversation: true }, orderBy: { flushAt: 'asc' } });
      if (!candidate) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${candidate.conversation.channel}:${candidate.conversation.customerId}`}))`;
      const current = await tx.agentMessageBatch.findUnique({ where: { id: candidate.id }, include: { conversation: true, messages: { orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }] } } });
      if (!current || current.status !== 'OPEN' || current.flushAt > now) return null;
      const won = await tx.agentMessageBatch.updateMany({ where: { id: current.id, status: 'OPEN' }, data: { status: 'PROCESSING' } });
      if (won.count !== 1) return null;
      const customerInput = current.messages.map(message => message.normalizedText).filter(Boolean).join('\n');
      await tx.agentMessageBatch.update({ where: { id: current.id }, data: { combinedInput: customerInput } });
      return { ...current, combinedInput: customerInput, status: 'PROCESSING' as const };
    });
    if (!batch) break;
    const published = await prisma.agentConfigurationVersion.findFirst({ orderBy: { version: 'desc' } });
    if (!published) { await prisma.agentMessageBatch.update({ where: { id: batch.id }, data: { status: 'OPEN' } }); break; }
    const generationToken = randomUUID();
    const claim = await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'PROCESSING' }, data: { status: 'GENERATING', generationToken, generationStartedAt: new Date() } });
    if (claim.count !== 1) continue;
    try {
      const courses = await prisma.course.findMany({ where: { status: 'PUBLISHED', archivedAt: null }, select: { id: true, name: true, shortDescription: true } });
      const reply = await generateSalesReply({ persona: published.persona, configurationVersion: published.version, customerInput: batch.combinedInput, conversationState: batch.conversation.state as Record<string, unknown>, verifiedContext: { courseCatalog: courses } }, createSalesAiClient(apiKey));
      const completed = await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'GENERATING', generationToken }, data: { status: 'READY_TO_SEND', responseText: reply, configurationVersion: published.version, generationStartedAt: null, generationToken: null, deliveryStatus: 'PENDING', deliveryStartedAt: null, deliveryToken: null } });
      if (completed.count === 1) processed++;
    } catch {
      await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'GENERATING', generationToken }, data: { status: 'OPEN', generationStartedAt: null, generationToken: null, flushAt: nextBatchFlushAt(new Date()) } });
    }
  }
  return processed;
}

export async function processPendingMessengerDeliveries(limit = 4): Promise<number> {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) return 0;
  let delivered = 0;
  for (let index = 0; index < limit; index++) {
    const candidate = await prisma.agentMessageBatch.findFirst({ where: { status: 'READY_TO_SEND', deliveryStatus: 'PENDING', conversation: { channel: 'MESSENGER' } }, include: { conversation: true }, orderBy: { createdAt: 'asc' } });
    if (!candidate) break;
    const deliveryToken = randomUUID();
    const batch = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${candidate.conversation.channel}:${candidate.conversation.customerId}`}))`;
      const current = await tx.agentMessageBatch.findUnique({ where: { id: candidate.id }, include: { conversation: true, messages: { orderBy: { receivedAt: 'desc' }, take: 1 } } });
      if (!current || current.status !== 'READY_TO_SEND' || current.deliveryStatus !== 'PENDING' || !current.responseText) return null;
      const latest = current.messages[0]?.sequence;
      if (!latest || current.conversation.lastInboundSequence !== latest) return null;
      const won = await tx.agentMessageBatch.updateMany({ where: { id: current.id, status: 'READY_TO_SEND', deliveryStatus: 'PENDING' }, data: { deliveryStatus: 'SENDING', deliveryStartedAt: new Date(), deliveryToken } });
      return won.count === 1 ? current : null;
    });
    if (!batch) continue;
    try {
      const finalized = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${batch.conversation.channel}:${batch.conversation.customerId}`}))`;
        const current = await tx.agentMessageBatch.findUnique({ where: { id: batch.id }, include: { conversation: true, messages: { orderBy: { receivedAt: 'desc' }, take: 1 } } });
        if (!current) return false;
        const latest = current.messages[0]?.sequence;
        if (!latest || current.conversation.lastInboundSequence !== latest) {
          await tx.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'READY_TO_SEND', deliveryStatus: 'SENDING', deliveryToken }, data: { status: 'SUPERSEDED', deliveryStatus: 'PENDING', deliveryStartedAt: null, deliveryToken: null } });
          return false;
        }
        await sendMessengerText(current.conversation.customerId, current.responseText, token);
        const won = await tx.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'READY_TO_SEND', deliveryStatus: 'SENDING', deliveryToken }, data: { status: 'PROCESSED', processedAt: new Date(), deliveredAt: new Date(), deliveryStatus: 'DELIVERED', deliveryStartedAt: null, deliveryToken: null } });
        if (won.count !== 1) return false;
        if (latest && current.conversation.lastInboundSequence === latest && current.conversation.lastInboundAt) {
          const [first, second] = scheduleFollowUps(current.conversation.lastInboundAt);
          for (const [stage, dueAt] of [[1, first], [2, second]] as const) await tx.agentFollowUp.upsert({ where: { conversationId_stage: { conversationId: current.conversationId, stage } }, create: { conversationId: current.conversationId, stage, dueAt }, update: { dueAt, status: 'PENDING' } });
        }
        return true;
      });
      if (finalized) delivered++;
    } catch {
      await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, deliveryStatus: 'SENDING', deliveryToken }, data: { deliveryStatus: 'AMBIGUOUS' } });
    }
  }
  return delivered;
}

app.post('/api/v1/agent/batches/claim', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const parsed = agentBatchClaimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid batch claim', issues: parsed.error.issues });
  const now = process.env.NODE_ENV === 'test' && parsed.data.now ? new Date(parsed.data.now) : new Date();
  const claimed = await prisma.$transaction(async tx => {
    const candidate = await tx.agentMessageBatch.findFirst({ where: { status: 'OPEN', flushAt: { lte: now }, messages: { none: { mediaStatus: { in: ['PENDING', 'PROCESSING'] } } } }, include: { conversation: true }, orderBy: { flushAt: 'asc' } });
    if (!candidate) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${candidate.conversation.channel}:${candidate.conversation.customerId}`}))`;
    const batch = await tx.agentMessageBatch.findUnique({ where: { id: candidate.id }, include: { messages: { orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }] } } });
    if (!batch || batch.status !== 'OPEN' || batch.flushAt > now) return null;
    const won = await tx.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'OPEN' }, data: { status: 'PROCESSING' } });
    if (won.count !== 1) return null;
    const messages = [...batch.messages].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()
      || left.receivedAt.getTime() - right.receivedAt.getTime()
      || left.id.localeCompare(right.id));
    const customerInput = messages.map(message => message.normalizedText).filter(Boolean).join('\n');
    await tx.agentMessageBatch.update({ where: { id: batch.id }, data: { combinedInput: customerInput } });
    return { batchId: batch.id, customerInput };
  });
  if (!claimed) return res.status(204).end();
  res.json(claimed);
});
app.post('/api/v1/agent/batches/:id/send', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const batchId = param(req.params.id);
  const pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN || '';
  if (!pageAccessToken) return res.status(503).json({ error: 'MESSENGER_PAGE_ACCESS_TOKEN is not configured' });
  const deliveryToken = randomUUID();
  const claim = await prisma.$transaction(async tx => {
    const candidate = await tx.agentMessageBatch.findUnique({ where: { id: batchId }, include: { conversation: true } });
    if (!candidate) return { status: 'NOT_FOUND' as const };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${candidate.conversation.channel}:${candidate.conversation.customerId}`}))`;
    const batch = await tx.agentMessageBatch.findUnique({ where: { id: batchId }, include: { conversation: true, messages: { orderBy: { receivedAt: 'desc' }, take: 1 } } });
    if (!batch) return { status: 'NOT_FOUND' as const };
    if (batch.status === 'PROCESSED') return { status: 'DELIVERED' as const };
    if (batch.status !== 'READY_TO_SEND' || !batch.responseText) return { status: 'NOT_READY' as const };
    if (batch.deliveryStatus === 'SENDING' || batch.deliveryStatus === 'AMBIGUOUS') return { status: 'AMBIGUOUS' as const };
    if (batch.conversation.channel !== 'MESSENGER') return { status: 'UNSUPPORTED_CHANNEL' as const };
    const batchLatest = batch.messages[0]?.sequence;
    if (!batchLatest || batch.conversation.lastInboundSequence !== batchLatest) return { status: 'STALE' as const };
    const won = await tx.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'READY_TO_SEND', deliveryStatus: 'PENDING' }, data: { deliveryStatus: 'SENDING', deliveryStartedAt: new Date(), deliveryToken } });
    if (won.count !== 1) return { status: 'AMBIGUOUS' as const };
    return { status: 'CLAIMED' as const, batch };
  });
  if (claim.status === 'NOT_FOUND') return res.status(404).json({ error: 'Message batch not found' });
  if (claim.status === 'DELIVERED') return res.json({ status: 'DELIVERED' });
  if (claim.status === 'NOT_READY') return res.status(409).json({ error: 'Message batch is not ready to send' });
  if (claim.status === 'STALE') return res.status(409).json({ error: 'A newer customer message superseded this reply' });
  if (claim.status === 'AMBIGUOUS') return res.status(409).json({ error: 'Messenger delivery is already in progress or requires reconciliation' });
  if (claim.status === 'UNSUPPORTED_CHANNEL') return res.status(400).json({ error: 'Unsupported delivery channel' });
  const { batch } = claim;
  try {
    const finalized = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${batch.conversation.channel}:${batch.conversation.customerId}`}))`;
      const fresh = await tx.agentMessageBatch.findUnique({ where: { id: batch.id }, include: { conversation: true, messages: { orderBy: { receivedAt: 'desc' }, take: 1 } } });
      if (!fresh) return false;
      const batchLatest = fresh.messages[0]?.sequence;
      if (!batchLatest || fresh.conversation.lastInboundSequence !== batchLatest) {
        await tx.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'READY_TO_SEND', deliveryStatus: 'SENDING', deliveryToken }, data: { status: 'SUPERSEDED', deliveryStatus: 'PENDING', deliveryStartedAt: null, deliveryToken: null } });
        return false;
      }
      await sendMessengerText(fresh.conversation.customerId, fresh.responseText, pageAccessToken);
      const deliveredAt = new Date();
      const won = await tx.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'READY_TO_SEND', deliveryStatus: 'SENDING', deliveryToken }, data: { status: 'PROCESSED', processedAt: deliveredAt, deliveredAt, deliveryStatus: 'DELIVERED', deliveryStartedAt: null, deliveryToken: null } });
      if (won.count !== 1) return false;
      if (fresh.conversation.lastInboundAt) {
        const [first, second] = scheduleFollowUps(fresh.conversation.lastInboundAt);
        for (const [stage, dueAt] of [[1, first], [2, second]] as const) await tx.agentFollowUp.upsert({ where: { conversationId_stage: { conversationId: fresh.conversationId, stage } }, create: { conversationId: fresh.conversationId, stage, dueAt }, update: { dueAt, status: 'PENDING' } });
      }
      return true;
    });
    if (!finalized) return res.status(409).json({ error: 'Messenger delivery requires reconciliation' });
    res.json({ status: 'DELIVERED' });
  } catch (error) {
    await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, deliveryStatus: 'SENDING', deliveryToken }, data: { deliveryStatus: 'AMBIGUOUS' } });
    throw error;
  }
});
app.post('/api/v1/agent/batches/:id/reconcile-delivery', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const parsed = agentDeliveryReconcileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid delivery reconciliation', issues: parsed.error.issues });
  const result = await prisma.agentMessageBatch.updateMany({ where: { id: param(req.params.id), status: 'READY_TO_SEND', deliveryStatus: 'AMBIGUOUS' }, data: { deliveryStatus: 'PENDING', deliveryStartedAt: null, deliveryToken: null } });
  if (result.count !== 1) return res.status(409).json({ error: 'Delivery is not awaiting reconciliation' });
  res.json({ status: 'PENDING' });
});
app.post('/api/v1/agent/batches/:id/delivered', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const batchId = param(req.params.id);
  await prisma.$transaction(async tx => {
    const candidate = await tx.agentMessageBatch.findUnique({ where: { id: batchId }, include: { conversation: true } });
    if (!candidate) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${candidate.conversation.channel}:${candidate.conversation.customerId}`}))`;
    const batch = await tx.agentMessageBatch.findUnique({ where: { id: batchId }, include: { conversation: true, messages: { orderBy: { receivedAt: 'desc' }, take: 1 } } });
    if (!batch) return;
    const deliveredAt = new Date();
    const won = await tx.agentMessageBatch.updateMany({ where: { id: batchId, status: 'READY_TO_SEND' }, data: { status: 'PROCESSED', processedAt: deliveredAt, deliveredAt, deliveryStatus: 'DELIVERED', deliveryStartedAt: null } });
    if (won.count !== 1) return;
    const batchLatest = batch.messages[0]?.sequence;
    if (!batchLatest || !batch.conversation.lastInboundAt || batch.conversation.lastInboundSequence !== batchLatest) return;
    const [first, second] = scheduleFollowUps(batch.conversation.lastInboundAt);
    for (const [stage, dueAt] of [[1, first], [2, second]] as const) await tx.agentFollowUp.upsert({ where: { conversationId_stage: { conversationId: batch.conversationId, stage } }, create: { conversationId: batch.conversationId, stage, dueAt }, update: { dueAt, status: 'PENDING' } });
  });
  res.status(204).end();
});
app.post('/api/v1/agent/meetings', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const parsed = agentMeetingInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid meeting request', issues: parsed.error.issues });
  if (!await prisma.agentConfigurationVersion.findUnique({ where: { version: parsed.data.configurationVersion } })) return res.status(409).json({ error: 'Unknown agent configuration version' });
  const { startsAt: startsAtText, now: requestedNow, sourceChannel, configurationVersion, summary, ...meeting } = parsed.data;
  const startsAt = new Date(startsAtText);
  const now = process.env.NODE_ENV === 'test' && requestedNow ? new Date(requestedNow) : new Date();
  const result = await reserveMeeting({ ...meeting, startsAt, now }, {
    create: input => prisma.$transaction(async tx => {
      const reservation = await tx.meetingReservation.create({ data: { ...input, endsAt: new Date(input.startsAt.getTime() + 60 * 60_000) } });
      await tx.agentHandoffEvent.create({ data: { type: 'MEETING_CONFIRMED', idempotencyKey: `meeting:${reservation.id}`, payload: { reservationId: reservation.id, customerId: reservation.customerId, customerName: reservation.customerName, phone: reservation.phone, startsAt: reservation.startsAt.toISOString(), mode: reservation.mode, ...(reservation.platform ? { platform: reservation.platform } : {}), sourceChannel, summary, configurationVersion } } });
      return reservation;
    }),
  });
  if (result.status === 'INVALID_SLOT' || result.status === 'MISSING_PLATFORM') return res.status(400).json(result);
  if (result.status === 'SLOT_TAKEN') return res.status(409).json(result);
  res.status(201).json(result);
  if (result.status === 'CONFIRMED') setImmediate(() => {
    void (async () => {
      const event = await prisma.agentHandoffEvent.findUnique({ where: { idempotencyKey: `meeting:${result.reservation.id}` } });
      if (event) await dispatchHandoffEvent(event.id);
    })().catch(() => undefined);
  });
});
app.post('/api/v1/agent/handoffs', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const parsed = agentHandoffInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid handoff event', issues: parsed.error.issues });
  if (parsed.data.type === 'MEETING_CONFIRMED') return res.status(400).json({ error: 'Meeting confirmation events are created only by the meeting reservation endpoint' });
  if (!await prisma.agentConfigurationVersion.findUnique({ where: { version: parsed.data.payload.configurationVersion } })) return res.status(409).json({ error: 'Unknown agent configuration version' });
  const existing = await prisma.agentHandoffEvent.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
  const event = await createHandoffEvent(parsed.data, {
    findByIdempotencyKey: key => prisma.agentHandoffEvent.findUnique({ where: { idempotencyKey: key } }),
    create: input => prisma.agentHandoffEvent.create({ data: { ...input, payload: input.payload as Prisma.InputJsonValue } }),
  });
  res.status(existing ? 200 : 201).json(event);
  if (!event.deliveredAt) setImmediate(() => { void dispatchHandoffEvent(event.id).catch(() => undefined); });
});

export async function dispatchHandoffEvent(eventId: string): Promise<{ status: 'NOT_FOUND' | 'DELIVERED' | 'BUSY'; odooLeadId?: number }> {
  const urls = [...new Set((process.env.HUMAN_NOTIFICATION_WEBHOOK_URLS || '').split(',').map(value => value.trim()).filter(Boolean))];
  const odoo = { url: process.env.ODOO_URL || '', database: process.env.ODOO_DATABASE || '', username: process.env.ODOO_USERNAME || '', apiKey: process.env.ODOO_API_KEY || '' };
  if (Object.values(odoo).some(value => !value) || urls.length < 2) throw new Error('Odoo and at least two human notification channels must be configured');
  const staleAt = new Date(Date.now() - 5 * 60_000);
  const dispatchToken = randomUUID();
  const claimed = await prisma.agentHandoffEvent.updateMany({ where: { id: eventId, deliveredAt: null, AND: [{ OR: [{ nextDispatchAt: null }, { nextDispatchAt: { lte: new Date() } }] }, { OR: [{ dispatchStatus: { in: ['PENDING', 'FAILED'] } }, { dispatchStatus: 'PROCESSING', dispatchStartedAt: { lte: staleAt } }] }] }, data: { dispatchStatus: 'PROCESSING', dispatchStartedAt: new Date(), dispatchToken, dispatchAttempts: { increment: 1 } } });
  if (claimed.count !== 1) {
    const current = await prisma.agentHandoffEvent.findUnique({ where: { id: eventId } });
    if (!current) return { status: 'NOT_FOUND' };
    return { status: current.deliveredAt ? 'DELIVERED' : 'BUSY' };
  }
  try {
    const event = await prisma.agentHandoffEvent.findUnique({ where: { id: eventId } });
    if (!event) return { status: 'NOT_FOUND' };
    const payload = event.payload as Record<string, unknown>;
    const integrationEvent = { idempotencyKey: event.idempotencyKey, type: event.type, summary: String(payload.summary || event.type), payload };
    const state = (event.deliveryState && typeof event.deliveryState === 'object' && !Array.isArray(event.deliveryState) ? event.deliveryState : {}) as { odooLeadId?: number; alerts?: string[] };
    if (!state.odooLeadId) {
      state.odooLeadId = await syncLeadToOdoo(integrationEvent, odoo);
      const saved = await prisma.agentHandoffEvent.updateMany({ where: { id: event.id, dispatchStatus: 'PROCESSING', dispatchToken }, data: { deliveryState: state as Prisma.InputJsonValue } });
      if (saved.count !== 1) throw new Error('Handoff dispatch lease expired');
    }
    state.alerts ||= [];
    for (const url of urls) {
      const destination = `notification:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`;
      if (state.alerts.includes(destination)) continue;
      await dispatchHumanAlert(integrationEvent, url);
      state.alerts.push(destination);
      const saved = await prisma.agentHandoffEvent.updateMany({ where: { id: event.id, dispatchStatus: 'PROCESSING', dispatchToken }, data: { deliveryState: state as Prisma.InputJsonValue } });
      if (saved.count !== 1) throw new Error('Handoff dispatch lease expired');
    }
    const finished = await prisma.agentHandoffEvent.updateMany({ where: { id: event.id, dispatchStatus: 'PROCESSING', dispatchToken }, data: { deliveredAt: new Date(), dispatchStatus: 'DELIVERED', dispatchStartedAt: null, dispatchToken: null, nextDispatchAt: null, deliveryState: state as Prisma.InputJsonValue } });
    if (finished.count !== 1) throw new Error('Handoff dispatch lease expired');
    return { status: 'DELIVERED', odooLeadId: state.odooLeadId };
  } catch (error) {
    await prisma.agentHandoffEvent.updateMany({ where: { id: eventId, dispatchStatus: 'PROCESSING', dispatchToken }, data: { dispatchStatus: 'FAILED', dispatchStartedAt: null, dispatchToken: null, nextDispatchAt: new Date(Date.now() + 60_000) } });
    throw error;
  }
}

export async function processPendingHandoffs(limit = 10): Promise<number> {
  const events = await prisma.agentHandoffEvent.findMany({ where: { deliveredAt: null, AND: [{ OR: [{ nextDispatchAt: null }, { nextDispatchAt: { lte: new Date() } }] }, { OR: [{ dispatchStatus: { in: ['PENDING', 'FAILED'] } }, { dispatchStatus: 'PROCESSING', dispatchStartedAt: { lte: new Date(Date.now() - 5 * 60_000) } }] }] }, orderBy: { createdAt: 'asc' }, take: limit, select: { id: true } });
  let delivered = 0;
  for (const event of events) {
    try { if ((await dispatchHandoffEvent(event.id)).status === 'DELIVERED') delivered++; } catch { /* one poison event must not starve later leads */ }
  }
  return delivered;
}

app.post('/api/v1/agent/handoffs/:id/dispatch', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const distinctNotificationUrls = new Set((process.env.HUMAN_NOTIFICATION_WEBHOOK_URLS || '').split(',').map(value => value.trim()).filter(Boolean));
  if (!process.env.ODOO_URL || !process.env.ODOO_DATABASE || !process.env.ODOO_USERNAME || !process.env.ODOO_API_KEY || distinctNotificationUrls.size < 2) return res.status(503).json({ error: 'Odoo and at least two human notification channels must be configured' });
  const result = await dispatchHandoffEvent(param(req.params.id));
  if (result.status === 'NOT_FOUND') return res.status(404).json({ error: 'Handoff event not found' });
  if (result.status === 'BUSY') return res.status(409).json({ error: 'Handoff event is already being dispatched' });
  res.json(result);
});
app.post('/api/v1/agent/respond', apiAuth, requireApiScope('agent:write'), async (req, res) => {
  const parsed = agentResponseInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid agent response request', issues: parsed.error.issues });
  let batch = await prisma.agentMessageBatch.findUnique({ where: { id: parsed.data.batchId }, include: { conversation: true } });
  if (!batch) return res.status(404).json({ error: 'Message batch not found' });
  if (batch.status === 'READY_TO_SEND' && batch.responseText && batch.configurationVersion) return res.json({ reply: batch.responseText, configurationVersion: batch.configurationVersion });
  if (batch.status === 'GENERATING' && batch.generationStartedAt && batch.generationStartedAt.getTime() <= Date.now() - 5 * 60_000) {
    await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'GENERATING', generationStartedAt: { lte: new Date(Date.now() - 5 * 60_000) } }, data: { status: 'PROCESSING', generationStartedAt: null, generationToken: null } });
    batch = await prisma.agentMessageBatch.findUnique({ where: { id: parsed.data.batchId }, include: { conversation: true } });
    if (!batch) return res.status(404).json({ error: 'Message batch not found' });
  }
  if (batch.status !== 'PROCESSING' || !batch.combinedInput) return res.status(409).json({ error: 'Message batch is not ready for generation' });
  const published = await prisma.agentConfigurationVersion.findFirst({ orderBy: { version: 'desc' } });
  if (!published) return res.status(503).json({ error: 'Published agent configuration is unavailable' });
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPEN_AI_API_KEY is not configured' });
  let verifiedContext: Record<string, unknown> = {};
  if (parsed.data.courseId) {
    const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, status: 'PUBLISHED', archivedAt: null }, include: { customFields: true, mediaLinks: true } });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    verifiedContext = projectCourse(course, res.locals.scopes.includes('sales-guidance:read'));
  }
  const generationToken = randomUUID();
  const generationClaim = await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'PROCESSING' }, data: { status: 'GENERATING', generationStartedAt: new Date(), generationToken } });
  if (generationClaim.count !== 1) return res.status(409).json({ error: 'Message batch is already being generated' });
  try {
    const reply = await generateSalesReply({ persona: published.persona, configurationVersion: published.version, customerInput: batch.combinedInput, conversationState: batch.conversation.state as Record<string, unknown>, verifiedContext }, createSalesAiClient(apiKey));
    const completed = await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'GENERATING', generationToken }, data: { status: 'READY_TO_SEND', responseText: reply, configurationVersion: published.version, generationStartedAt: null, generationToken: null, deliveryStatus: 'PENDING', deliveryStartedAt: null } });
    if (completed.count !== 1) return res.status(409).json({ error: 'Generation lease expired; retry the batch' });
    res.json({ reply, configurationVersion: published.version });
  } catch {
    await prisma.agentMessageBatch.updateMany({ where: { id: batch.id, status: 'GENERATING', generationToken }, data: { status: 'PROCESSING', generationStartedAt: null, generationToken: null } });
    res.status(502).json({ error: 'The sales agent is temporarily unavailable' });
  }
});

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../dist');
app.use(express.static(clientDir));
app.get('*splat', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
