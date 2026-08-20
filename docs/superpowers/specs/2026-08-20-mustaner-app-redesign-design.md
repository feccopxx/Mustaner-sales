# Mustaner Course Intelligence App Redesign

Date: 2026-08-20
Status: Approved design, pending implementation

## Objective

Replace the current generic interface with a distinctive Mustaner-branded editorial workspace while preserving the existing course, API-key, authentication, publishing, revision, Markdown, and RTL functionality.

## Canonical brand assets

- The Mustaner logo supplied at `https://kommodo.ai/i/9VeBPo9itfCc9sl2NlzL` is mandatory.
- Its resolved public image asset is `https://plain-eeur-prod-public.komododecks.com/202608/20/9VeBPo9itfCc9sl2NlzL/image.webp`.
- The implementation will store a local copy so the application does not depend on a third-party page or redirect at runtime.
- The logo must not be redrawn, recolored, or embedded into generated illustrations.

## Visual direction

The selected direction is **Editorial Control**: a disciplined knowledge workspace with strong typography, deep-teal navigation, crisp content panels, restrained geometry, and selective teal-to-green brand fields.

### Palette

- Deep teal: `#064C43`
- Primary teal: `#0E7F5E`
- Fresh green: `#6AAA48`
- Pale mint: `#D9F0E7`
- Dark ink: `#173F39`
- Warm amber illustration accent: `#EFB33E`
- Optional small blue accent within illustrations: `#116CB5`

Gradients are reserved for prominent brand fields such as the login story panel. Ordinary app surfaces remain flat and quiet.

### Geometry and surfaces

- Controls and small panels use approximately 4–6px corner radii.
- Large containers may use up to 8px.
- Pills are avoided except when a compact semantic status cannot be expressed more clearly another way.
- Borders and dividers create structure; shadows are subtle and rare.
- Buttons use compact, boxy silhouettes with custom line icons where an icon is useful.

### Typography

- Strong editorial headings establish hierarchy without oversized marketing typography.
- Labels are compact, clear, and operational.
- IDs and technical values use tabular or monospace treatment where useful.
- English is the interface language.
- User-authored content can be in any language.
- Arabic blocks automatically render RTL; mixed Arabic and English must remain readable using direction-aware containers rather than applying RTL to the entire interface.

## Login experience

Desktop uses a 50/50 split layout.

- Left: deep-teal-to-green brand panel, short product statement, and the approved two-person course-intelligence illustration.
- Right: quiet white authentication surface using the canonical Mustaner logo, one password field, concise supporting copy, and the primary login action.
- The login remains password-only and preserves the existing encryption, cookie, rate-limiting, and error behavior.
- On mobile, the form appears first. The brand panel becomes a shorter supporting section beneath it.

## Authenticated application shell

- Persistent deep-teal navigation on desktop.
- Compact responsive navigation on smaller screens.
- The real logo anchors the shell.
- Navigation remains focused on Courses, API access, and Audit activity.
- Icons are a coherent custom line family, paired with labels where ambiguity is possible.
- The application avoids invented dashboard metrics and decorative cards.

## Course library

The selected layout is **Library first**.

- The course index receives the full content width.
- Search and status filters sit close to the list they control.
- Rows communicate name, immutable course ID, publication status, and relevant dates without excessive badges.
- The new-course action is visually clear but compact.
- Selecting a course opens a dedicated editing page rather than a permanent split pane.
- With no courses, show the approved course-building illustration, concise explanatory text, and one create-course action.

## Course editor

The selected layout is **Tabbed document**.

- Dedicated page with a clear course title and immutable ID context.
- Top-level tabs: General, Content, Custom fields, and History.
- General includes name, ID, short description, price, status, and media links.
- Content provides wide Markdown writing surfaces for Curriculum and How to sell.
- Custom fields preserve public/internal visibility, ordering, creation, editing, and deletion.
- History preserves revisions and restoration.
- Preview and save actions remain visible and unambiguous without crowding the document.
- Unsaved changes and validation errors must be explicit.

## API access

- API-key management uses the same editorial workspace language.
- Scope choices remain understandable and explicit.
- Key secrets are shown only once after generation, matching current security behavior.
- Revocation is a clearly destructive action with confirmation.
- With no keys, show the approved secure key-and-automation illustration and one generate-key action.

## Illustration system

The approved family uses flat geometric people interacting with structured interfaces.

- Solid shapes and crisp silhouettes
- Minimal facial detail
- Professional MENA-region characters and clothing
- Boxy UI elements with slight corner softening
- Teal and green dominant palette with restrained amber
- No embedded text, logo, watermark, glossy 3D, cyberpunk motifs, or decorative clutter

Approved assets:

1. Login hero: two professionals organizing structured course content on a large display.
2. Course empty state: two professionals assembling and reviewing course modules.
3. API-key empty state: one professional connecting a secure key between course data and an automation system.

Generated assets will be stored locally in the application and optimized for delivery. Accessible alternative text will describe their purpose.

## Motion and interaction

- Short directional transitions support navigation and state changes.
- Hover and focus feedback is immediate and restrained.
- No floating decorations, bouncing controls, looping motion, or fade-only page theatrics.
- Reduced-motion preferences disable nonessential transitions.
- Keyboard focus remains clearly visible.

## Responsive behavior

- Desktop prioritizes a persistent navigation rail and wide editorial canvas.
- Tablet compresses navigation and preserves readable fields.
- Mobile uses a single content column, form-first login ordering, compact action bars, and horizontally safe tabs.
- Tables may become structured stacked rows when columns no longer fit.
- No content, controls, or mixed-language text may clip at 320px width.

## Functional preservation

The redesign must preserve:

- App-password authentication and rate limiting
- Secure sessions and CSRF protection
- Course creation, editing, publishing, archiving, and restoration
- Immutable manually entered course IDs
- Markdown authoring and sanitized rendering
- Public and internal custom fields
- Media links
- Revision history
- Scoped API-key generation and revocation
- Public and privileged API projections
- Audit log
- Existing database schema unless a visual requirement demonstrates a real data need

## Validation

- Existing automated tests must remain green.
- Add component tests for login layout, navigation, empty states, tabs, and RTL behavior where coverage is missing.
- Verify production build and dependency audit.
- Verify desktop, tablet, and 320px mobile layouts.
- Verify keyboard navigation, visible focus, labels, contrast, alternative text, and reduced motion.
- Verify the deployed Railway homepage, login, authenticated session, course workflow, and API-key workflow.

## Out of scope

- Changes to the sales-agent workflow or n8n implementation
- Changes to Odoo CRM
- New analytics or dashboard metrics
- New authentication methods
- Changes to the course API contract unless required to prevent a regression
