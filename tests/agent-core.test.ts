import { describe, expect, it } from 'vitest';
import {
  DEBOUNCE_MS,
  combineInboundBatch,
  nextBatchFlushAt,
  normalizeInboundMessage,
} from '../server/agent/inbound.js';
import {
  qualifyAutomationLead,
  selectAutomationNextAction,
} from '../server/agent/qualification.js';
import {
  validateMeetingSlot,
} from '../server/agent/scheduling.js';
import { scheduleFollowUps } from '../server/agent/follow-up.js';
import { validateOutboundAction } from '../server/agent/safety.js';
import { reserveMeeting } from '../server/agent/booking.js';
import { createHandoffEvent } from '../server/agent/handoff.js';
import { publishAgentConfiguration } from '../server/agent/configuration.js';
import { generateSalesReply } from '../server/agent/runtime.js';

describe('agent inbound message handling', () => {
  it('flushes a customer batch 15 seconds after the latest message', () => {
    expect(DEBOUNCE_MS).toBe(15_000);
    expect(nextBatchFlushAt(new Date('2026-08-26T12:00:02.000Z')).toISOString()).toBe('2026-08-26T12:00:17.000Z');
  });

  it('combines separate messages chronologically into one agent input', () => {
    expect(combineInboundBatch([
      { id: '3', kind: 'TEXT', text: 'و عايز اعرف حيبدأ امتى', occurredAt: new Date('2026-08-26T12:00:03Z') },
      { id: '1', kind: 'TEXT', text: 'السلام عليكم', occurredAt: new Date('2026-08-26T12:00:01Z') },
      { id: '2', kind: 'TEXT', text: 'ممكن اعرف سعر الكورس كام', occurredAt: new Date('2026-08-26T12:00:02Z') },
    ])).toBe('السلام عليكم\nممكن اعرف سعر الكورس كام\nو عايز اعرف حيبدأ امتى');
  });

  it('treats voice transcripts as ordinary text', () => {
    expect(normalizeInboundMessage({ id: 'v1', kind: 'VOICE', text: 'عايز استشارة', occurredAt: new Date() })).toBe('عايز استشارة');
  });

  it('labels non-voice media and limits its summary to five lines', () => {
    expect(normalizeInboundMessage({
      id: 'p1', kind: 'PDF', text: 'one\ntwo\nthree\nfour\nfive\nsix', occurredAt: new Date(),
    })).toBe('User sent a PDF with these details:\none\ntwo\nthree\nfour\nfive');
  });

  it('does not label an already-normalized media relay twice', () => {
    const relay = 'User sent a PDF with these details:\none\ntwo';
    expect(normalizeInboundMessage({ id: 'p2', kind: 'PDF', text: relay, occurredAt: new Date() })).toBe(relay);
  });
});

describe('AI and automation qualification', () => {
  it.each([
    [{ exactNeed: true }, 'exact_need'],
    [{ budgetEgp: 25_000 }, 'budget'],
    [{ hasInternalSystems: true }, 'internal_systems'],
    [{ clearProblem: true }, 'clear_problem'],
  ] as const)('qualifies immediately when one criterion is met', (facts, reason) => {
    expect(qualifyAutomationLead(facts)).toEqual({ qualified: true, reason });
  });

  it('does not qualify a lead with a budget below EGP 25,000 alone', () => {
    expect(qualifyAutomationLead({ budgetEgp: 24_999 })).toEqual({ qualified: false });
  });

  it('moves a qualified lead directly to meeting details', () => {
    expect(selectAutomationNextAction({ facts: { clearProblem: true }, questionsAsked: 1 })).toBe('COLLECT_MEETING_DETAILS');
  });

  it('hands an unqualified lead to a human after four questions', () => {
    expect(selectAutomationNextAction({ facts: { budgetEgp: 5_000 }, questionsAsked: 4 })).toBe('COLLECT_HUMAN_FOLLOWUP_DETAILS');
  });
});

describe('meeting policy', () => {
  it('accepts a Sunday 5 PM Cairo slot that has two hours notice', () => {
    expect(validateMeetingSlot(
      new Date('2026-08-30T14:00:00.000Z'),
      new Date('2026-08-30T11:00:00.000Z'),
    )).toEqual({ valid: true });
  });

  it('rejects Friday and Saturday', () => {
    expect(validateMeetingSlot(new Date('2026-08-28T09:00:00.000Z'), new Date('2026-08-27T08:00:00.000Z'))).toEqual({ valid: false, reason: 'NON_WORKING_DAY' });
  });

  it('rejects half-hour starts', () => {
    expect(validateMeetingSlot(new Date('2026-08-30T11:30:00.000Z'), new Date('2026-08-29T08:00:00.000Z'))).toEqual({ valid: false, reason: 'NOT_HOURLY' });
  });

  it('rejects same-day slots with less than two hours notice', () => {
    expect(validateMeetingSlot(new Date('2026-08-30T12:00:00.000Z'), new Date('2026-08-30T10:30:00.000Z'))).toEqual({ valid: false, reason: 'INSUFFICIENT_NOTICE' });
  });
});

describe('follow-up policy', () => {
  it('defers off-hours follow-ups to 9 AM on the next working day', () => {
    expect(scheduleFollowUps(new Date('2026-08-27T16:00:00.000Z')).map(date => date.toISOString())).toEqual([
      '2026-08-30T06:00:00.000Z',
      '2026-08-31T06:00:00.000Z',
    ]);
  });
});

describe('outbound action safety', () => {
  it('rejects a meeting confirmation without a reservation', () => {
    expect(validateOutboundAction({ confirmsMeeting: true })).toEqual({ valid: false, reason: 'MISSING_MEETING_RESERVATION' });
  });

  it('allows a meeting confirmation backed by a reservation', () => {
    expect(validateOutboundAction({ confirmsMeeting: true, meetingReservationId: 'booking-1' })).toEqual({ valid: true });
  });
});

describe('collision-safe meeting reservations', () => {
  it('returns a confirmed reservation created by the shared store', async () => {
    const result = await reserveMeeting({
      customerId: 'lead-1', customerName: 'Ahmed', phone: '01000000000', mode: 'ONLINE', platform: 'ZOOM',
      startsAt: new Date('2026-08-30T14:00:00.000Z'), now: new Date('2026-08-29T09:00:00.000Z'),
    }, { create: async input => ({ id: 'meeting-1', ...input }) });
    expect(result).toMatchObject({ status: 'CONFIRMED', reservation: { id: 'meeting-1' } });
  });

  it('reports an occupied slot when the database uniqueness constraint wins', async () => {
    const result = await reserveMeeting({
      customerId: 'lead-2', customerName: 'Mona', phone: '01100000000', mode: 'FACE_TO_FACE',
      startsAt: new Date('2026-08-30T14:00:00.000Z'), now: new Date('2026-08-29T09:00:00.000Z'),
    }, { create: async () => { throw { code: 'P2002' }; } });
    expect(result).toEqual({ status: 'SLOT_TAKEN' });
  });
});

describe('idempotent handoff events', () => {
  it('returns the existing event when the same source action is retried', async () => {
    const existing = { id: 'event-1', idempotencyKey: 'conversation-1:consultation' };
    const result = await createHandoffEvent({
      type: 'CONSULTATION_REQUEST', idempotencyKey: existing.idempotencyKey, payload: { phone: '01200000000' },
    }, {
      findByIdempotencyKey: async () => existing,
      create: async () => { throw new Error('must not create'); },
    });
    expect(result).toEqual(existing);
  });
});

describe('versioned agent configuration', () => {
  it('publishes an immutable next version from a draft', async () => {
    const writes: unknown[] = [];
    const result = await publishAgentConfiguration({ id: 'draft-1', persona: 'Warm Egyptian sales advisor' }, {
      latestVersion: async () => 3,
      publish: async input => { writes.push(input); return { id: 'config-4', version: input.version, persona: input.persona }; },
    });
    expect(result).toEqual({ id: 'config-4', version: 4, persona: 'Warm Egyptian sales advisor' });
    expect(writes).toEqual([{ version: 4, persona: 'Warm Egyptian sales advisor', sourceDraftId: 'draft-1' }]);
  });

  it('retries a concurrent version conflict before publishing', async () => {
    let attempts = 0;
    const result = await publishAgentConfiguration({ id: 'draft-1', persona: 'Mustaner voice' }, {
      latestVersion: async () => attempts === 0 ? 3 : 4,
      publish: async input => { attempts += 1; if (attempts === 1) throw { code: 'P2002' }; return { id: 'config-5', version: input.version, persona: input.persona }; },
    });
    expect(result.version).toBe(5);
    expect(attempts).toBe(2);
  });
});

describe('sales agent model boundary', () => {
  it('keeps persona, verified context, state, and customer input in explicit layers', async () => {
    const requests: unknown[] = [];
    const reply = await generateSalesReply({
      persona: 'Speak naturally in Egyptian Arabic.',
      configurationVersion: 4,
      customerInput: 'سعر الكورس كام؟',
      conversationState: { service: 'COURSE', courseId: 'ai-architect' },
      verifiedContext: { name: 'AI Architect', price: '17,000 EGP' },
    }, { create: async request => { requests.push(request); return { output_text: 'سعر الكورس ١٧ ألف جنيه يا فندم.' }; } });
    expect(reply).toBe('سعر الكورس ١٧ ألف جنيه يا فندم.');
    expect(requests).toEqual([expect.objectContaining({
      model: 'gpt-5.4-mini',
      store: false,
      instructions: expect.stringContaining('Speak naturally in Egyptian Arabic.'),
      input: expect.stringContaining('"customerInput":"سعر الكورس كام؟"'),
    })]);
  });
});
