import { describe, expect, it } from 'vitest';
import { agentHandoffInputSchema, detectDirection, renderMarkdown, validateCourseInput } from '../server/domain.js';

describe('course content domain', () => {
  it('detects Arabic-leading mixed content as RTL', () => {
    expect(detectDirection('تعلم AI automation للشركات')).toBe('rtl');
  });

  it('detects English-leading content as LTR', () => {
    expect(detectDirection('AI للشركات')).toBe('ltr');
  });

  it('sanitizes scripts from rendered Markdown', () => {
    const html = renderMarkdown('**Safe** <script>alert(1)</script>');
    expect(html).toContain('<strong>Safe</strong>');
    expect(html).not.toContain('<script>');
  });

  it('requires a manual ID, name, and unique custom field names', () => {
    const result = validateCourseInput({
      id: '', name: '', shortDescription: '', price: '', curriculum: '', howToSell: '', status: 'DRAFT',
      customFields: [{ name: 'Objection', content: 'A', visibility: 'INTERNAL' }, { name: 'objection', content: 'B', visibility: 'PUBLIC' }],
      mediaLinks: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('course enrollment handoff', () => {
  it('accepts phone and email before payment details are confirmed by a human', () => {
    const result = agentHandoffInputSchema.safeParse({
      type: 'COURSE_ENROLLMENT',
      idempotencyKey: 'messenger:customer:execution:COURSE_ENROLLMENT',
      payload: {
        sourceChannel: 'MESSENGER',
        summary: 'Learner accepted the online course schedule and requested enrollment follow-up.',
        configurationVersion: 1,
        courseId: '01',
        email: 'learner@example.com',
        phone: '01012345678',
      },
    });

    expect(result.success).toBe(true);
  });
});
