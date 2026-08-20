import { describe, expect, it } from 'vitest';
import { projectCourse } from '../server/course-projection.js';

const course = {
  id: '83', name: 'AI Growth', shortDescription: 'Grow with AI', price: 'EGP 5,000', curriculum: '## Modules', howToSell: 'Lead with ROI', status: 'PUBLISHED', archivedAt: null,
  customFields: [
    { id: '1', name: 'Takeaway', content: 'Automation plan', visibility: 'PUBLIC', position: 0 },
    { id: '2', name: 'Objection', content: 'Answer internally', visibility: 'INTERNAL', position: 1 },
  ],
  mediaLinks: [{ id: 'm1', label: 'Brochure', url: 'https://example.com/b.pdf', type: 'PDF', description: '', position: 0 }],
};

describe('API course projection', () => {
  it('omits sales guidance and internal fields from public output', () => {
    const output = projectCourse(course, false);
    expect(output).not.toHaveProperty('howToSell');
    expect(output.customFields.map((field) => field.name)).toEqual(['Takeaway']);
  });

  it('includes sales guidance and internal fields for privileged output', () => {
    const output = projectCourse(course, true);
    expect(output.howToSell?.markdown).toBe('Lead with ROI');
    expect(output.customFields).toHaveLength(2);
  });
});
