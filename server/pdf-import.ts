import type { CourseInput } from './domain.js';
import OpenAI from 'openai';

export type PdfImportQuestion = { field: keyof Pick<CourseInput, 'id' | 'name' | 'shortDescription' | 'price' | 'curriculum' | 'howToSell'>; question: string };

const coreQuestions: Array<PdfImportQuestion> = [
  { field: 'id', question: 'What is the course ID?' },
  { field: 'name', question: 'What is the course name?' },
  { field: 'shortDescription', question: 'Please provide a short course description.' },
  { field: 'price', question: 'Please provide the course price.' },
  { field: 'curriculum', question: 'Please provide the course curriculum.' },
  { field: 'howToSell', question: 'Please provide guidance for selling this course.' },
];

export function normalizePdfCourseDraft(value: CourseInput) {
  const draft: CourseInput = { ...value, status: 'DRAFT' };
  return { draft, questions: coreQuestions.filter(({ field }) => !draft[field].trim()) };
}

export function validatePdfUpload(file: { mimetype: string; originalname: string; size: number }) {
  if (file.mimetype !== 'application/pdf' || !file.originalname.toLowerCase().endsWith('.pdf')) throw new Error('Upload a PDF file');
  if (file.size === 0) throw new Error('The PDF file is empty');
}

const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
const textValue = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => `- ${textValue(item)}`).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${label(key)}: ${textValue(item)}`).filter((item) => !item.endsWith(': ')).join('\n');
  return '';
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parsePdfCourseDraft(value: unknown): CourseInput {
  const raw = record(value);
  const customFields = Array.isArray(raw.customFields) ? raw.customFields.map(record).filter((field) => textValue(field.name)).map((field) => ({ name: textValue(field.name), content: textValue(field.content), visibility: field.visibility === 'PUBLIC' ? 'PUBLIC' as const : 'INTERNAL' as const })) : [];
  const mediaLinks = Array.isArray(raw.mediaLinks) ? raw.mediaLinks.map(record).filter((media) => textValue(media.label) && textValue(media.url)).map((media) => ({ label: textValue(media.label), url: textValue(media.url), type: ['IMAGE', 'PDF', 'VIDEO', 'DOCUMENT', 'OTHER'].includes(textValue(media.type)) ? textValue(media.type) as CourseInput['mediaLinks'][number]['type'] : 'OTHER', description: textValue(media.description) })) : [];
  return { id: textValue(raw.id), name: textValue(raw.name), shortDescription: textValue(raw.shortDescription), price: textValue(raw.price), curriculum: textValue(raw.curriculum), howToSell: textValue(raw.howToSell), status: 'DRAFT', customFields, mediaLinks };
}

export type PdfAiClient = {
  files: { create: (file: File, options: { purpose: 'user_data' }) => Promise<{ id: string }>; del: (id: string) => Promise<unknown> };
  responses: { create: (request: unknown) => Promise<{ output_text: string }> };
};

export function createPdfAiClient(apiKey: string): PdfAiClient {
  const client = new OpenAI({ apiKey });
  return {
    files: {
      create: async (file, options) => client.files.create({ file, purpose: options.purpose }),
      del: async (id) => client.files.delete(id),
    },
    responses: { create: async (request) => {
      const response = await client.responses.create(request as never);
      return response as { output_text: string };
    } },
  };
}

const extractionInstructions = `Extract course information from this PDF. Return JSON only. Use empty strings or empty arrays when the PDF does not support a value. Do not invent facts. Include id, name, shortDescription, price, curriculum, howToSell, customFields, and mediaLinks. Custom fields use name, content, visibility (PUBLIC or INTERNAL). Media links use label, url, type (IMAGE, PDF, VIDEO, DOCUMENT, or OTHER), and description.`;

export async function extractPdfCourseDraft(pdf: Buffer, filename: string, client: PdfAiClient) {
  const file = await client.files.create(new File([Uint8Array.from(pdf)], filename, { type: 'application/pdf' }), { purpose: 'user_data' });
  try {
    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: [{ role: 'user', content: [{ type: 'input_text', text: extractionInstructions }, { type: 'input_file', file_id: file.id }] }],
      text: { format: { type: 'json_object' } },
    });
    return normalizePdfCourseDraft(parsePdfCourseDraft(JSON.parse(response.output_text)));
  } finally {
    await client.files.del(file.id);
  }
}
