# Mustaner Course Catalog

An internal course knowledge base for Mustaner's AI sales agent. The React/Vite interface manages course content; Express and Prisma expose a scoped, read-only API backed by PostgreSQL.

## Core behavior

- One Argon2id-protected administrative app password
- Draft/published lifecycle and recoverable archiving
- Manual immutable course IDs
- Markdown for pricing, curriculum, sales guidance, and custom fields
- Automatic Arabic/English text direction and bidirectional-safe rendering
- Public/internal custom-field visibility
- Hashed, named, scoped, revokable API keys
- Course revisions and audit events

## Local setup

1. Copy `.env.example` to `.env` and fill the values.
2. Run `npm install`.
3. Run `npx prisma migrate deploy`.
4. Run `npm run dev`.

The first successful login stores an Argon2id hash of `APP_PASSWORD` in PostgreSQL. Later changes to the environment variable do not overwrite that hash.

## Agent API

Send an API key with `X-API-Key: mstr_...` or `Authorization: Bearer mstr_...`.

- `GET /api/v1/courses` — lightweight index of published, non-archived courses
- `GET /api/v1/courses?q=automation` — search by ID, name, or short description
- `GET /api/v1/courses/:id` — public course details
- `GET /api/v1/courses/:id?view=sales` — privileged details; requires `sales-guidance:read`

API responses include sanitized HTML, raw Markdown, and detected text direction for content fields.

## Railway

Create a Railway project with a PostgreSQL service and this application service. Set `APP_PASSWORD` and `SESSION_SECRET`; Railway supplies `DATABASE_URL` when PostgreSQL is connected. The start command applies committed migrations before launching the server.
