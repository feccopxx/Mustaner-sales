export type HandoffEventType = 'AI_AUTOMATION_LEAD' | 'MEETING_CONFIRMED' | 'CONSULTATION_REQUEST' | 'COURSE_ENROLLMENT';

export interface HandoffEventInput {
  type: HandoffEventType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface HandoffRepository<T extends { id: string; idempotencyKey: string }> {
  findByIdempotencyKey(key: string): Promise<T | null>;
  create(input: HandoffEventInput): Promise<T>;
}

export async function createHandoffEvent<T extends { id: string; idempotencyKey: string }>(input: HandoffEventInput, repository: HandoffRepository<T>): Promise<T> {
  const existing = await repository.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;
  try {
    return await repository.create(input);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      const concurrent = await repository.findByIdempotencyKey(input.idempotencyKey);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}
