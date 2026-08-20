import { detectDirection, renderMarkdown } from './domain.js';

type Field = { id: string; name: string; content: string; visibility: string; position: number };
type Media = { id: string; label: string; url: string; type: string; description: string; position: number };
type Course = { id: string; name: string; shortDescription: string; price: string; curriculum: string; howToSell: string; status: string; archivedAt: Date | null; customFields: Field[]; mediaLinks: Media[] };

const content = (markdown: string) => ({ markdown, html: renderMarkdown(markdown), direction: detectDirection(markdown) });

export function projectCourse(course: Course, privileged: boolean) {
  const projected: Record<string, unknown> = {
    id: course.id,
    name: course.name,
    shortDescription: content(course.shortDescription),
    price: content(course.price),
    curriculum: content(course.curriculum),
    status: course.status,
    customFields: course.customFields
      .filter((field) => privileged || field.visibility === 'PUBLIC')
      .sort((a, b) => a.position - b.position)
      .map((field) => ({ name: field.name, visibility: field.visibility, ...content(field.content) })),
    mediaLinks: [...course.mediaLinks].sort((a, b) => a.position - b.position).map(({ id: _id, position: _position, ...media }) => media),
  };
  if (privileged) projected.howToSell = content(course.howToSell);
  return projected as { howToSell?: ReturnType<typeof content>; customFields: Array<{ name: string; visibility: string; markdown: string; html: string; direction: string }>; [key: string]: unknown };
}
