import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

const arabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
const latin = /[A-Za-z]/;

export function detectDirection(value: string): 'rtl' | 'ltr' {
  for (const char of value.trim()) {
    if (arabic.test(char)) return 'rtl';
    if (latin.test(char)) return 'ltr';
  }
  return 'ltr';
}

export function renderMarkdown(value: string): string {
  return sanitizeHtml(marked.parse(value, { async: false }), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

const customFieldSchema = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().max(100_000),
  visibility: z.enum(['PUBLIC', 'INTERNAL']),
});

export const globalFieldInputSchema = customFieldSchema;

export const agentConfigurationDraftSchema = z.object({
  persona: z.string().trim().min(1).max(200_000),
});

export const agentMeetingInputSchema = z.object({
  customerId: z.string().trim().min(1).max(240),
  customerName: z.string().trim().min(1).max(240),
  phone: z.string().trim().min(5).max(40),
  mode: z.enum(['ONLINE', 'FACE_TO_FACE']),
  platform: z.enum(['GOOGLE_MEET', 'ZOOM', 'DISCORD']).optional(),
  startsAt: z.iso.datetime(),
  now: z.iso.datetime().optional(),
  sourceChannel: z.string().trim().min(1).max(80),
  configurationVersion: z.number().int().positive(),
  summary: z.string().trim().min(1).max(2_000),
});

const handoffBase = z.object({
  idempotencyKey: z.string().trim().min(1).max(240),
});
const eventContext = { sourceChannel: z.string().trim().min(1).max(80), summary: z.string().trim().min(1).max(2_000), configurationVersion: z.number().int().positive() };
export const agentHandoffInputSchema = z.discriminatedUnion('type', [
  handoffBase.extend({ type: z.literal('AI_AUTOMATION_LEAD'), payload: z.object({ ...eventContext, qualificationStatus: z.enum(['qualified', 'needs_human_discovery']), phone: z.string().trim().min(5).max(40), name: z.string().trim().max(240).optional(), qualificationReason: z.string().trim().max(240).optional() }) }),
  handoffBase.extend({ type: z.literal('MEETING_CONFIRMED'), payload: z.object({ ...eventContext, reservationId: z.string().min(1), customerId: z.string().min(1), customerName: z.string().min(1), phone: z.string().min(5), startsAt: z.iso.datetime(), mode: z.enum(['ONLINE', 'FACE_TO_FACE']), platform: z.enum(['GOOGLE_MEET', 'ZOOM', 'DISCORD']).optional() }) }),
  handoffBase.extend({ type: z.literal('CONSULTATION_REQUEST'), payload: z.object({ ...eventContext, phone: z.string().trim().min(5).max(40), reason: z.string().trim().min(1).max(2_000), name: z.string().trim().max(240).optional() }) }),
  handoffBase.extend({ type: z.literal('COURSE_ENROLLMENT'), payload: z.object({ ...eventContext, courseId: z.string().min(1), email: z.email(), phone: z.string().min(5), paymentPreference: z.string().min(1), name: z.string().max(240).optional() }) }),
]);

export const agentResponseInputSchema = z.object({
  batchId: z.string().trim().min(1).max(240),
  courseId: z.string().trim().min(1).max(64).optional(),
});

export const agentInboundMessageSchema = z.object({
  channel: z.string().trim().min(1).max(80),
  customerId: z.string().trim().min(1).max(240),
  sourceMessageId: z.string().trim().min(1).max(240),
  kind: z.enum(['TEXT', 'VOICE', 'IMAGE', 'PDF', 'DOCX', 'VIDEO', 'OTHER']),
  text: z.string().max(100_000),
  occurredAt: z.iso.datetime(),
  receivedAt: z.iso.datetime().optional(),
});

export const agentBatchClaimSchema = z.object({ now: z.iso.datetime().optional() });

const mediaLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.url(),
  type: z.enum(['IMAGE', 'PDF', 'VIDEO', 'DOCUMENT', 'OTHER']).default('OTHER'),
  description: z.string().max(2_000).default(''),
});

export const courseInputSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores'),
  name: z.string().trim().min(1).max(240),
  shortDescription: z.string().max(5_000),
  price: z.string().max(20_000),
  curriculum: z.string().max(100_000),
  howToSell: z.string().max(100_000),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  customFields: z.array(customFieldSchema).max(100),
  mediaLinks: z.array(mediaLinkSchema).max(100),
}).superRefine((course, ctx) => {
  const seen = new Set<string>();
  course.customFields.forEach((field, index) => {
    const key = field.name.trim().toLocaleLowerCase();
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['customFields', index, 'name'], message: 'Custom field names must be unique' });
    seen.add(key);
  });
});

export type CourseInput = z.infer<typeof courseInputSchema>;
export const validateCourseInput = (input: unknown) => courseInputSchema.safeParse(input);
