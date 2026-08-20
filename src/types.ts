export type Visibility = 'PUBLIC' | 'INTERNAL';
export type CourseStatus = 'DRAFT' | 'PUBLISHED';
export interface CustomField { id?: string; name: string; content: string; visibility: Visibility; }
export interface MediaLink { id?: string; label: string; url: string; type: 'IMAGE'|'PDF'|'VIDEO'|'DOCUMENT'|'OTHER'; description: string; }
export interface Course { id: string; name: string; shortDescription: string; price: string; curriculum: string; howToSell: string; status: CourseStatus; archivedAt?: string|null; updatedAt?: string; customFields: CustomField[]; mediaLinks: MediaLink[]; }
export const emptyCourse = (): Course => ({ id: '', name: '', shortDescription: '', price: '', curriculum: '', howToSell: '', status: 'DRAFT', customFields: [], mediaLinks: [] });
