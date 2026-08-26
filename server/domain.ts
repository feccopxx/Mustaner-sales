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
