import { describe, expect, it } from 'vitest';
import { extractPdfCourseDraft, normalizePdfCourseDraft, parsePdfCourseDraft, validatePdfUpload } from '../server/pdf-import.js';

describe('PDF course import', () => {
  it('turns an extraction into an editable course draft', () => {
    const result = normalizePdfCourseDraft({
      id: 'ai-growth-101',
      name: 'AI Growth for Business',
      shortDescription: 'A practical course for business teams.',
      price: 'EGP 5,000',
      curriculum: '## Module 1\nAI foundations',
      howToSell: 'Lead with practical outcomes.',
      customFields: [{ name: 'Audience', content: 'Business developers', visibility: 'PUBLIC' }],
      mediaLinks: [],
    });

    expect(result.draft).toMatchObject({ id: 'ai-growth-101', name: 'AI Growth for Business', status: 'DRAFT' });
    expect(result.draft.customFields).toEqual([{ name: 'Audience', content: 'Business developers', visibility: 'PUBLIC' }]);
    expect(result.questions).toEqual([]);
  });

  it('asks for each missing core field without fabricating a value', () => {
    const result = normalizePdfCourseDraft({
      id: '', name: 'AI Growth for Business', shortDescription: '', price: '', curriculum: '', howToSell: '', customFields: [], mediaLinks: [],
    });

    expect(result.draft).toMatchObject({ id: '', price: '', curriculum: '' });
    expect(result.questions).toEqual([
      { field: 'id', question: 'What is the course ID?' },
      { field: 'shortDescription', question: 'Please provide a short course description.' },
      { field: 'price', question: 'Please provide the course price.' },
      { field: 'curriculum', question: 'Please provide the course curriculum.' },
      { field: 'howToSell', question: 'Please provide guidance for selling this course.' },
    ]);
  });

  it('keeps structured price and curriculum values returned for a real course PDF', () => {
    const draft = parsePdfCourseDraft({
      id: '', name: 'AI Automation System Architect', shortDescription: 'Design AI systems.',
      price: { earlyBird: '15,000 EGP', standard: '17,000 EGP' },
      curriculum: ['Design systems', 'Build agents'], howToSell: '', customFields: [], mediaLinks: [],
    });

    expect(draft.price).toBe('Early Bird: 15,000 EGP\nStandard: 17,000 EGP');
    expect(draft.curriculum).toBe('- Design systems\n- Build agents');
  });

  it('deletes the OpenAI file after extracting a course draft', async () => {
    const deleted: string[] = [];
    const result = await extractPdfCourseDraft(Buffer.from('%PDF-1.7'), 'course.pdf', {
      files: { create: async () => ({ id: 'file_pdf' }), del: async (id: string) => { deleted.push(id); } },
      responses: { create: async () => ({ output_text: JSON.stringify({ id: '101', name: 'AI Basics', shortDescription: 'Intro', price: 'EGP 100', curriculum: 'Module 1', howToSell: 'Lead with ROI', customFields: [], mediaLinks: [] }) }) },
    });

    expect(result.draft.name).toBe('AI Basics');
    expect(deleted).toEqual(['file_pdf']);
  });

  it('rejects a non-PDF upload before it reaches OpenAI', () => {
    expect(() => validatePdfUpload({ mimetype: 'image/png', originalname: 'course.png', size: 100 })).toThrow('Upload a PDF file');
  });
});
