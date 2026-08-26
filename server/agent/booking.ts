import { validateMeetingSlot } from './scheduling.js';

export type MeetingMode = 'ONLINE' | 'FACE_TO_FACE';
export type MeetingPlatform = 'GOOGLE_MEET' | 'ZOOM' | 'DISCORD';

export interface MeetingReservationInput {
  customerId: string;
  customerName: string;
  phone: string;
  mode: MeetingMode;
  platform?: MeetingPlatform;
  startsAt: Date;
}

export interface MeetingRepository {
  create(input: MeetingReservationInput): Promise<Omit<MeetingReservationInput, 'platform'> & { id: string; platform?: MeetingPlatform | null }>;
}

export async function reserveMeeting(input: MeetingReservationInput & { now: Date }, repository: MeetingRepository) {
  const validity = validateMeetingSlot(input.startsAt, input.now);
  if (!validity.valid) return { status: 'INVALID_SLOT' as const, reason: validity.reason };
  const { now: _now, ...reservationInput } = input;
  if (reservationInput.mode === 'ONLINE' && !reservationInput.platform) return { status: 'MISSING_PLATFORM' as const };
  try {
    const reservation = await repository.create(reservationInput);
    return { status: 'CONFIRMED' as const, reservation };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return { status: 'SLOT_TAKEN' as const };
    throw error;
  }
}
