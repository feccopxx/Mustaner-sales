# Mustaner live-site source audit

Fetched 2026-08-20 from `https://mustaner.com`. This document distinguishes the Mustaner storefront from Odoo's database-selector shell and from unused declarations shipped in Odoo's global bundles.

## 1. Logo system

- Storefront logo: `https://mustaner.com/web/image/website/2/logo/Mustaner?unique=d443c2b`; fetched as WebP, 8,552 bytes, 89×10 encoded canvas. The homepage renders it at `width="95" height="40"` with `alt="Mustaner"`.
- Storefront favicon: `https://mustaner.com/web/image/website/2/favicon?unique=d443c2b`; ICO, 57,820 bytes, 256×256 decoded.
- Additional partner/reference artwork: `https://mustaner.com/web/image/6319-cd0f7ef9/Clip%20path%20group.png`; PNG, 8,680 bytes, 244×58. Its dominant opaque pixels are `#116CB5` (2,223 px) and `#0E7F5E` (1,062 px).
- The Odoo selector—not the Mustaner storefront—uses `https://mustaner.com/web/static/img/logo2.png`, a 300×131 Odoo wordmark with dominant opaque pixels `#8F8F8F` and `#714B67`.

No SVG logo was linked by any fetched page, so SVG paths, fills, and viewBoxes cannot be determined.

## 2. Color palette

Confirmed from Mustaner's fetched compiled stylesheet:

| Role evidenced by selectors | Value | Source evidence |
|---|---:|---|
| Primary button/tag/accent | `#7C3CFF` | `.o_edu_btn_primary`, `.o_edu_type_badge`, `.o_edu_eyebrow` |
| Primary hover | `#6528E0` | `.o_edu_btn_primary:hover`, `.o_edu_btn_solid:hover` |
| Primary dark gradient endpoint | `#1E1B4B` | `.o_edu_card_thumb`, `.o_edu_cta_inner` |
| Heading/near-black | `#1E293B` | `.o_edu_hero_title`, `.o_edu_card_title` |
| Body copy | `#4B5563` | `.o_edu_hero_subtitle`, `.o_edu_testimonial_body` |
| Muted copy | `#6B7280` | `.o_edu_section_subtitle`, metadata selectors |
| Border | `#E8EDF5` | cards, pills, filters |
| Soft page background | `#F5F7FB` | `.o_edu_academy_page`, card footer |
| White | `#FFFFFF` / `#FFF` | hero, cards, CTA text |
| Rating yellow | `#FBBF24` | `.fa-star`, `.o_edu_ribbon` |
| Success green | `#16A34A` | seats/level indicators |
| WhatsApp button | `#25D366` | homepage inline style |
| Homepage inline green | `rgb(5, 122, 87)` | homepage inline style |
| Homepage inline orange | `rgb(239, 156, 33)` | homepage inline style |

The logo's exact WebP palette could not be decoded by the available local raster stack; visual inspection alone is not used as token evidence.

## 3. Typography

The fetched CSS defines the default sans stack as `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, "Noto Sans", Arial, "Odoo Unicode Support Noto", sans-serif, "Apple Color Emoji"`. It also contains Arabic rules using `"IBM Plex Sans Arabic", "Odoo Unicode Support Noto", sans-serif`, Font Awesome 4.7, and Odoo icon fonts.

No homepage declaration proves that IBM Plex Sans Arabic is used for the English storefront. The effective rendered font at each breakpoint cannot be determined without computed-style capture.

## 4. Spacing and layout

Confirmed custom layout rules include:

- Hero: two-column grid `1fr 1.2fr`, `2.5rem` gap; collapses to one column at `max-width: 880px`.
- Hero title: `2.4rem`, weight `800`, line-height `1.25`.
- Course card grid: `repeat(auto-fill, minmax(255px, 1fr))`, `1.25rem` gap in the later compiled rule.
- Horizontal course card: `275px` flex basis, `14px` radius; thumbnail ratio `16 / 9`.
- CTA: grid `.8fr 1.2fr`, `2rem` gap, `2.5rem` padding, `24px` radius; one column at `880px`.
- Courses filter page: `260px 1fr`, `2rem` gap; one column at `880px`.

These are exact compiled CSS declarations, not a normalized spacing scale. No inferred spacing scale is supplied.

## 5. Components

Source-confirmed custom families are `.o_edu_hero`, `.o_edu_card_v2`, `.o_edu_instructor_card_v2`, `.o_edu_view_all_btn`, `.o_edu_scroll_btn`, `.o_edu_cta_banner`, `.o_edu_filters_panel`, and `.o_edu_diploma_page`.

The homepage source instantiates Bootstrap carousels through `class="carousel slide o_edu_card_carousel"`, `class="carousel slide o_edu_instructors_row"`, and `data-bs-ride="carousel"`. Course and instructor cards use horizontal scrolling/snap at supported layouts.

## 6. Imagery

The homepage references a large base64 JPEG hero asset, two additional embedded JPEGs, two embedded PNGs, `/education_management/static/src/img/hero_student.png`, course imagery served through `/web/image/...`, the Mustaner logo/favicon, and the 244×58 partner/reference graphic listed above. Embedded payloads are preserved verbatim in [site-home.html](.site-evidence/site-home.html); their full inventory is not duplicated here.

## 7. Motion and animation

The inspected storefront corpus is 3,741,741 bytes: homepage HTML (145,243), compiled CSS (879,019), lazy JS (2,688,343), and minimal JS (29,136).

Bundle-wide census (declarations shipped by Odoo; not proof every item is instantiated on this homepage):

| Category | Confirmed count |
|---|---:|
| `@keyframes` | 73 occurrences, 72 unique names |
| Animation declarations | 110 source-census occurrences, 102 unique |
| Transition declarations | 186 occurrences, 88 unique |
| Transform declarations | 244 occurrences, 119 unique |
| 3D/origin declarations | 21 occurrences, 12 unique |
| `will-change` | 3, all `will-change: transform` |
| Scroll snap | 2× `scroll-snap-type: x mandatory`; 2× `scroll-snap-align: start` |
| Cubic-bezier curves | 23 occurrences, 9 unique |
| Framer JSON / appear IDs | zero |
| Webflow/GSAP attributes | zero |
| Spring presets | zero |
| Tween presets | zero |

All 72 keyframe names and every extracted declaration/value are preserved in [site-census.txt](.site-evidence/site-census.txt). The exact cubic-bezier census is: 7× `(0.215, 0.61, 0.355, 1)`; 4× `(0.55, 0.055, 0.675, 0.19)`; 4× `(0.175, 0.885, 0.32, 1)`; 2× `(0.19, 1, 0.22, 1)`; 2× `(0.02, 0.01, 0.47, 1)`; and 1× each `(0.51, 0.92, 0.24, 1.15)`, `(0.5, 0, 1, 0.5)`, `(0, 0.5, 0.5, 1)`, `(0, 0.2, 0.8, 1)`.

Homepage-specific motion evidence:

- Course and instructor carousels are instantiated.
- Custom cards declare `transition: all .2s ease` and hover `transform: translateY(-3px)`.
- Scroll buttons declare `transition: all .15s ease`.
- Category tiles declare `transition: all .15s ease` and hover/active `transform: translateY(-2px)`.
- No `<video>` element occurs in the fetched homepage HTML.
- Reduced motion is handled by 32 CSS media-rule excerpts plus a compiled-JS handler: `const scrollDelta=window.matchMedia(\`(prefers-reduced-motion: reduce)\`).matches?scroll:Math.floor(scroll/4);`.

Animation gaps: carousel interval and per-instance interaction timing are not declared in the homepage HTML. They may use Bootstrap defaults or runtime config, but that cannot be asserted from the fetched instance. Resolve by opening Chrome DevTools → Elements/Properties for `#eduCoursesCarousel`, then DevTools → Animations and triggering Next/Previous and hover states.

## 8. Voice and tone

Verbatim homepage hierarchy:

- H1: `Learn the Skills of the Future from the Best Instructors`
- H2: `Popular Courses`; `Start Your Learning Journey Today`; `Learn From The Best`
- Course titles: `AI Growth For Business Developer`; `Ai Automation in business`; `Business Development Mastry`; `AI Automation for Business Developers`; `Strategic Thinking for Business Developers`
- CTAs: `View All Courses`; `Join Now`; `View All Instructors`; `Contact Us ​​​​​​`; `Sign in`

The confirmed copy is direct, aspirational, and action-led. It repeatedly foregrounds future skills, instructors, and business-oriented AI learning. Spelling/capitalization inconsistencies (`Ai`, `Mastry`) are present in the source and have not been corrected here.

Additional exact page headings are recorded from `/about-us` (`About Us`, `Our Methodology`, `Partners and References`), `/our-services` (`Services ​`, `Partners and references`), `/contactus` (`Contact us`), `/jobs` (`Career Advisor`, `Trainer`, `Content Creator`), `/slides` (`Reach new heights`, `Start your online course today!`), and `/instructors` (`All Instructors`).

## 9. Source URLs

Fetched: `/`, `/odoo`, `/odoo?db=mustaner`, `/web/database/selector`, `/web/database/manager`, `/web/login`, `/about-us`, `/our-services`, `/contactus`, `/courses/all`, `/instructors`, `/jobs`, `/slides`, `/shop`, `/blog`, `/ar`, `/course/66`, `/course/80`, `/course/81`, `/course/83`, `/course/88`, `/templates`, `/tools`, `/robots.txt`, `/sitemap.xml`; the three `/web/assets/2/...` bundles named in [site-home.html](.site-evidence/site-home.html); and the image URLs in §1.

## 10. Gaps and uncertainties

- First-visit routing is misconfigured or intentionally exposes database selection: a fresh `/` request goes `303 /odoo` → `303 /web/database/selector`, while `/` becomes the storefront only after the `mustaner` database cookie is established.
- `/templates` and `/tools` are linked in the homepage navigation but return `404` with `Error 404` / `We couldn't find the page you're looking for!`.
- `/sitemap.xml` returned 404 without the database session and 403 with it, so sitemap contents cannot be determined.
- The robots response varied by session during independent fetches (`Disallow: /` in the fresh selector flow; a sitemap directive in a database-selected flow). Treat crawler behavior as unstable until server routing is fixed.
- Effective computed fonts, responsive geometry, and browser-resolved carousel interval were not captured.
- Odoo release number cannot be determined. Bootstrap 5.3.3 and Font Awesome 4.7.0 are confirmed from their fetched source banners.

## Confirmed vs inferred

| Item | Status |
|---|---|
| Odoo-backed site and selector | Confirmed — fetched routes and `/web/...` assets |
| Bootstrap 5.3.3 | Confirmed — fetched CSS banner |
| Font Awesome 4.7.0 | Confirmed — fetched CSS banner |
| Primary purple `#7C3CFF` | Confirmed — Mustaner `.o_edu_*` CSS |
| Homepage copy and CTA labels | Confirmed — fetched page HTML |
| Carousel components present | Confirmed — homepage classes/data attributes |
| Every bundle animation runs on homepage | Not established; the census is bundle-wide |
| Exact Odoo version | Unknown |
| Computed English font | Unknown without browser computed styles |
| Database selector shown to ordinary new visitors | Confirmed for fresh HTTP sessions; persistence/CDN/browser history may alter individual visits |
