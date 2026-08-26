import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma.js';
import { courseInputSchema } from './domain.js';
import { createApiKey, hashPassword, synchronizePasswordHash, verifyApiKey, verifyPassword } from './security.js';
import { csrfGuard, issueSession, newCsrfToken, requireAdmin } from './auth.js';
import { projectCourse } from './course-projection.js';
import multer from 'multer';
import { createPdfAiClient, extractPdfCourseDraft, validatePdfUpload } from './pdf-import.js';

const include = { customFields: true, mediaLinks: true } as const;
const param = (value: string | string[]) => Array.isArray(value) ? value[0] : value;
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', csrfGuard);

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
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
    const created = await prisma.course.create({ data: { ...course, customFields: { create: customFields.map((f, position) => ({ ...f, position })) }, mediaLinks: { create: mediaLinks.map((m, position) => ({ ...m, position })) } }, include });
    await prisma.auditLog.create({ data: { action: 'course.created', entityType: 'course', entityId: created.id } });
    res.status(201).json(created);
  } catch { res.status(409).json({ error: 'Course ID or custom field name already exists' }); }
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
  const name = String(req.body?.name || '').trim(); const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((s: unknown) => ['courses:read', 'sales-guidance:read'].includes(String(s))) : [];
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
  const candidates = await prisma.apiKey.findMany({ where: { revokedAt: null } });
  const key = candidates.find((candidate) => verifyApiKey(plaintext, candidate.keyHash));
  if (!key) return res.status(401).json({ error: 'Invalid API key' });
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  res.locals.scopes = key.scopes; next();
}
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

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../dist');
app.use(express.static(clientDir));
app.get('*splat', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
