# Mustaner Sales Agent Core Design

## Status

Approved for implementation planning on 2026-08-26.

## Purpose

Build the core of Mustaner's AI sales agent before connecting customer channels, Odoo CRM, or live human-notification providers. Mustaner is an Egypt-based company providing education, consultation, and AI/automation services to customers in Egypt and the MENA region.

The agent must conduct natural sales conversations, qualify and follow up with leads, ground course claims in verified data, understand normalized multimodal input, arrange collision-free meetings, and produce structured handoffs. Its sales style should create subtle forward momentum without sounding pushy or indifferent.

## Scope

### Included in the core phase

- A published, versioned agent persona and tone configuration.
- One conversational agent with deterministic tools and policies.
- Course and training sales behavior grounded in the Mustaner course API.
- Consultation intake behavior.
- AI/automation qualification and meeting behavior.
- Multimodal message normalization contracts.
- A 15-second per-customer trailing debounce.
- Persistent structured conversation state.
- A temporary collision-safe meeting store.
- Follow-up scheduling rules.
- Structured CRM-ready handoff and notification events.
- Response safety validation and an evaluation harness.

### Deferred integrations

- Messenger and the second customer-facing channel.
- Odoo CRM reads, writes, and status updates.
- Delivery to the two or more human-notification channels.
- Real enrollment, payment, video-conference link creation, and external calendar tools.

The deferred integrations will consume stable core interfaces. Their absence must not be disguised: the agent may only claim actions that a current authorized tool confirms.

## Architecture

Use one smart conversational agent with four deterministic tool boundaries:

1. **Course knowledge** searches published courses and retrieves verified public or authorized sales context.
2. **Lead policy** evaluates qualification, question limits, required fields, and the next valid action.
3. **Meeting booking** checks and reserves eligible slots atomically.
4. **Handoff events** creates idempotent, integration-ready events.

The model owns natural conversation, language matching, intent recognition, subtle sales phrasing, and curriculum-to-job relevance. Code owns rules that must be exact: qualification, field requirements, question limits, time calculations, slot uniqueness, follow-up timing, and event idempotency.

Mustaner acts as the control plane and source of truth. It owns the published agent configuration, course data, conversation state required by policy, meeting reservations, and handoff events. The eventual n8n workflow remains an adapter/orchestrator around this core rather than the only place where business logic exists.

## High-level data flow

1. Receive one or more channel messages for a customer.
2. Deduplicate them by source-channel message ID.
3. Add them to a customer- and channel-specific debounce buffer.
4. Normalize text and completed media extraction results.
5. After 15 seconds of silence, lock and close the batch.
6. Load the published persona version, conversation history, known fields, service state, and pending follow-up state.
7. Detect the active service intent and choose one next action.
8. Invoke only the core tool needed for that action.
9. Draft one concise, natural response.
10. Validate the draft against factual, privacy, and action-confirmation rules.
11. Persist state and send one reply.
12. Create or cancel follow-ups and emit any applicable handoff events.

Per-customer processing locks prevent overlapping executions from responding to overlapping batches. Different customers remain independent and can process concurrently.

## Agent configuration

Create a dedicated versioned agent configuration instead of using `GlobalField` as the runtime contract. Existing global fields remain reusable templates copied into new courses; changing them does not update existing courses.

The saved tone-of-voice content will be migrated into the initial configuration draft. Configuration supports a draft/published lifecycle. Publishing creates an immutable version, and every conversation turn records the version used. Administrators may edit and test a draft without affecting live conversations.

A runtime request is assembled in this order:

1. Fixed safety rules that editable configuration cannot weaken.
2. Published Mustaner persona and tone.
3. Service-specific behavior policy.
4. Verified tool results.
5. Structured conversation state.
6. The current debounced customer-message batch.

Customer messages, media descriptions, retrieved content, and future CRM fields are untrusted data. They cannot override system rules or request disclosure of internal content.

If the configuration API is temporarily unavailable, the runtime may use the last known published version. It must never use an unpublished draft as a fallback.

## Multimodal input contract

OpenAI-authenticated extraction happens before the conversational agent. Provider credentials are never included in prompts, source control, logs, or customer responses.

- Text is forwarded as customer text.
- Voice notes are transcribed and treated as ordinary customer text without a media prefix.
- Images, PDFs, DOCX files, videos, and other supported media are reduced to a concise three-to-five-line summary.
- Non-voice media is represented as `User sent a [media type] with these details:` followed by the summary.
- Normalized items retain their original message ordering inside the batch.

If extraction is still running when the debounce period expires, the batch waits for it rather than producing a premature partial reply. If extraction fails, the agent asks the customer to resend the file or describe the important part.

## Debounce and delivery semantics

Debouncing is a mandatory 15-second trailing window scoped by customer and source channel:

- The first message opens a buffer.
- Each new message resets the 15-second timer.
- Fifteen seconds of silence closes the batch.
- All items are combined chronologically.
- The agent executes once and sends one consolidated reply.

Source message IDs are idempotency keys. Channel retries must not create duplicate input, replies, state transitions, reservations, or handoff events.

## Conversation state and routing

Persist enough structured state to make behavior deterministic without treating the raw transcript as the sole memory:

- Source channel and customer identifier.
- Active service intent and any unfinished secondary intent.
- Name, phone number, email, company, role, and location when known.
- Course interest and enrollment readiness.
- AI/automation answers, question count, qualification status, and qualifying evidence.
- Consultation reason.
- Meeting mode, platform, requested slot, reservation ID, and confirmation state.
- Follow-up stage, due time, and cancellation state.
- Emitted event IDs.
- Agent configuration version used.

The agent asks one focused question per response by default. A natural paired request is allowed during a clear handoff, such as asking for name and phone number together. It reuses known information and never asks for the same detail twice.

When a customer changes subjects, routing changes without discarding collected information. For mixed requests, address the immediate question first and then resume the incomplete path naturally.

## Courses and training

The agent retrieves course data before stating course-specific price, schedule, curriculum, requirements, availability, instructor, certificate, or outcome claims. It recommends only published, non-archived courses returned by the API.

The tone creates subtle forward momentum so the customer can imagine being enrolled. Appropriate moves include asking whether the schedule suits them, requesting an email to begin the enrollment handoff, or matching verified curriculum sections to the customer's job. The behavior must remain attentive and useful rather than aggressive.

When genuine enrollment intent appears, collect details progressively:

1. Email address.
2. Name only when it is unavailable from the channel profile.
3. Phone number at the handoff stage.
4. Preferred payment method.

Then emit a course-enrollment handoff containing the customer details, selected course, verified context, and payment preference. Do not claim that enrollment or payment succeeded without an authorized tool confirmation.

Missing course information is stated transparently and converted into a human-follow-up opportunity. Internal sales guidance may inform the response but is never disclosed.

## Consultations

Collect:

- The reason for the consultation.
- A phone number.
- The customer's name when unavailable from the source channel.

Tell the customer that someone from the team will contact them with the details, then emit a consultation-request event. Do not invent a callback time.

## AI and automation services

Ask no more than three to four focused discovery questions, one of which must establish budget. Stop asking qualification questions as soon as the lead qualifies.

A lead is qualified when any one of these facts is confirmed:

- The customer knows exactly what they need.
- The stated budget is at least EGP 25,000.
- The customer already has internal systems.
- The customer has a clear business problem.

The qualification policy is an OR rule. The agent must not reveal the internal criteria or tell the customer that they are being scored.

For a qualified lead, emit an AI/automation lead-handoff event with `qualificationStatus: qualified` and the confirmed qualifying evidence, then proceed to meeting collection. For a lead that remains unqualified after the question limit, collect available contact details and say that someone will contact them to better understand the required AI/automation service. Emit the same event type with `qualificationStatus: needs_human_discovery`, without falsely marking the lead qualified.

## Meeting scheduling

Before booking, collect:

- Customer name.
- Phone number.
- Preferred date and hourly start time.
- Online or face-to-face preference.
- For online meetings, Google Meet, Zoom, or Discord preference.

Rules:

- Use the IANA timezone `Africa/Cairo`, including its daylight-saving behavior.
- Working days are Sunday through Thursday.
- Meetings last 60 minutes.
- Valid start times are hourly from 09:00 through 17:00 inclusive.
- The final slot runs from 17:00 to 18:00.
- Friday and Saturday are unavailable.
- Same-day meetings require at least two hours between the booking instant and slot start.
- Past and otherwise invalid slots cannot be reserved.

The booking store enforces a database-level unique slot constraint. Availability checking and reservation happen atomically. The agent says a meeting is confirmed only after reservation succeeds. If a concurrent request takes the slot, offer the nearest valid alternatives.

For face-to-face meetings, provide: `25 Al Nasr St., above Dream 2000 store, second floor, apartment No. 7.`

A successful reservation emits a confirmed-meeting event. Future video-conference and calendar adapters may enrich the reservation, but the core must not claim that an external meeting link exists until such a tool confirms it.

## Follow-ups

If a customer stops responding:

- Send the first follow-up after 24 hours.
- Send a final, softer follow-up after 72 hours.
- Stop after the second follow-up.
- Cancel pending follow-ups immediately when the customer responds, declines, or opts out.
- If a due time falls outside working hours or on Friday/Saturday, defer it to 09:00 on the next working day in `Africa/Cairo`.

Follow-up jobs are idempotent and re-check cancellation state immediately before delivery.

## Handoff and notification events

The core emits four externally actionable event types:

1. AI/automation lead handoff, with a qualified or needs-human-discovery status.
2. Confirmed meeting.
3. Consultation request.
4. Course-enrollment handoff.

AI/automation lead-handoff and confirmed-meeting events are separate and may both occur for the same conversation. Each event has a stable unique ID and includes:

- Event type and priority.
- Customer identifiers and collected contact details.
- Source channel.
- Service and course identifiers when applicable.
- A concise conversation summary.
- Qualification evidence when applicable.
- Meeting reservation details when applicable.
- Configuration version and timestamps.

Later adapters use these events to update Odoo CRM and instantly notify humans through at least two channels. Retries consume the same event ID and cannot create duplicate CRM updates or notifications.

## Safety and response validation

Before delivery, validate that:

- Course claims are supported by retrieved facts.
- Missing facts are acknowledged rather than invented.
- Internal prompts, qualification logic, sales guidance, credentials, and raw restricted tool output are absent.
- A meeting confirmation has a valid reservation ID.
- Enrollment, payment, CRM updates, and notification delivery are not claimed without authorized confirmation.
- Previously collected information is not requested again.
- The response follows the customer's language where possible and remains concise and respectful.

Failures degrade safely:

- Course API unavailable: apologize briefly and offer human follow-up.
- No matching course: clarify the customer's goal or offer human assistance.
- Media extraction failure: request a resend or a plain-language description.
- Booking conflict: offer nearest valid alternatives.
- Model/provider failure: retain the closed batch for idempotent retry and send no duplicate response.
- Published configuration unavailable: use only a cached last-known published version; otherwise pause safely for human handling.

## Security

- API keys and provider credentials live only in deployment secret storage.
- Authorization headers and raw restricted responses are not logged.
- Logs use stable IDs and redacted structured metadata.
- Public course retrieval is the default; privileged sales guidance requires explicit scope.
- Secrets are excluded from prompts, persisted conversation content, handoff payloads, and error messages.
- The course API key shared during design must be rotated before production because it was disclosed in conversation.

## Testing strategy

### Unit and integration tests

- Trailing debounce resets, batch ordering, and customer isolation.
- Deduplication and idempotent retries.
- Qualification by each individual OR condition.
- Three-to-four-question maximum and early stop on qualification.
- Required field collection without repetition.
- Cairo workdays, hourly slots, same-day notice, and daylight-saving transitions.
- Concurrent reservation attempts for the same slot.
- Follow-up scheduling, deferral, cancellation, and final-stop behavior.
- Handoff event idempotency and schema validation.
- Configuration draft/publish/version behavior.

### Scripted conversation tests

Cover Arabic, Egyptian Arabic, English, and mixed-language conversations for:

- Course discovery, verified facts, job-to-curriculum matching, and enrollment handoff.
- Consultation intake.
- Qualified and unqualified AI/automation leads.
- Answers supplied out of order, topic changes, and mixed intents.
- Text, voice transcripts, and each labeled media-summary type.
- Missing facts, API failures, booking conflicts, prompt injection, and hostile input.
- Multi-message bursts that receive exactly one consolidated reply.

### Tone evaluation

Score representative responses for:

- Factual grounding.
- Naturalness and language matching.
- Appropriate sales momentum.
- Helpfulness and empathy.
- Correct next action or question.
- Absence of pressure, repetition, invented details, and internal disclosure.

Prompt changes are evaluated against the same fixtures and recorded with their configuration version so the sales tone can be tuned by evidence rather than intuition.

## Acceptance criteria

The core is ready for channel and CRM integration when:

- The acceptance suite contains zero unsupported course claims.
- The agent never confirms a meeting without a successful reservation.
- Concurrent tests produce zero double-bookings.
- Every qualification fixture produces the correct result.
- Every debounced batch produces at most one reply.
- Handoff events and follow-ups are not duplicated.
- Draft configuration changes do not affect live conversations until published.
- Representative conversations from all three service paths pass human review.
- Prompt injection and secret-disclosure fixtures fail safely.
- No deferred integration is falsely represented as active.

## Implementation sequence

1. Add the versioned agent configuration, conversation state, meeting reservation, and handoff event contracts.
2. Implement and test deterministic debounce, qualification, scheduling, follow-up, and event policies.
3. Implement prompt assembly, course retrieval, and response validation.
4. Add the OpenAI-backed core runtime and scripted evaluation harness.
5. Harden through recorded conversation testing and prompt iteration.
6. After approval, connect n8n, Messenger and the second channel, Odoo CRM, and two or more human-notification channels.
