# Mory · UI/UX modernization

UI-only work based on fetched `main` at `89439df`, on `feature/ui-ux-pro-max`. The existing purple identity, photos, routes and product workflows remain intact. No deployment or merge is part of this work.

Review: [Draft PR #1 — Modernize Mory journal UI and accessibility](https://github.com/phanducquang/Mory/pull/1), targeting `main`.

## Review artifacts

- [Screen-by-screen audit](AUDIT.md)
- [Reviewed UI UX Pro Max design recommendation](design-system/mory-ui-modernization/MASTER.md) — the approved rules explicitly override unsuitable marketing layouts/fonts in the generated reference.
- [Implementation plan and excluded feature proposals](PLAN.md)
- [Interactive before/after comparison](comparison.html) — open locally in a browser; GitHub displays its source.
- [Before screenshots](before/) and [after screenshots](after/), at 390px and 1440px, viewport height 960px.
- [Before measurements](before/demo-measurements.json), [after measurements](after/demo-measurements.json), [measured token contrast](contrast.json).

Screenshots use the existing demo dataset or new disposable test accounts. Password, email and invitation/token inputs are masked. No real family data, credentials, browser state, database dump or trace is included. Extra `server-*-full-*` after images show full account/family/settings content beyond the viewport.

## Implemented changes

One existing token/CSS layer now controls the local font stack, 16px body/input text, label/metadata hierarchy, purple action variants, borders, radii and restrained shadows. The rail, header, cards, filters, forms, profile, auth/family panels, dialogs, toast and fallback states share this scale.

Mobile layouts wrap long text and controls, retain every existing action, separate hero copy from its image/age card, and reserve space around the bottom navigation and safe-area insets. The third existing memory card is visible on mobile instead of being hidden by a legacy rule. Upload/reminder groups and milestone controls have readable spacing and larger touch targets.

A keyboard skip link targets the existing main content. Child selectors expose their full selected name through `title`; type filters expose their existing selected state with `aria-pressed`. Existing dialog trapping/restoration, notification dismissal and toast timing are unchanged. Reduced-motion styles disable transitions and animations.

## Verification results

| Check | Result |
| --- | --- |
| `npm run lint` in the original workspace | Existing failure: 15 `no-require-imports` errors and one warning in untracked user `.agents/` skill scripts; preserved and excluded from the PR |
| `npm run lint -- --ignore-pattern '.agents/**'` | Passed for application, tests and review scripts |
| `npm run typecheck` | Passed |
| `npm test` | 18 files / 122 tests passed |
| `npm run build` in an isolated copy, without `.env` | Passed; Next.js 16.4.2 production standalone output |
| Production demo E2E | Chromium 21 and Android Chromium 21 passed; WebKit 20 passed plus its keyboard case passed on the targeted rerun |
| Targeted keyboard regression, all three browser projects | 3 passed |
| Disposable family integration tests | 14 passed |
| Disposable production account/media/email/privacy/reminder E2E | 15 passed, including the new UI evidence test; all owned resources cleaned up |
| Final welcome spacing adjustment | Production rebuilt; targeted account UI/evidence test passed again; screenshots refreshed |
| Demo responsive measurements | 42 route/width combinations; zero horizontal overflow and zero measured controls shorter than 44px after changes |
| Account responsive checks | Passed at seven widths for account, family, join and settings; verification/reset/invite/welcome evidence captured |
| Token contrast | Ink 13.38:1, muted 6.35:1, accent link 6.64:1, primary button 5.03:1, danger 5.87:1 |

Widths: **320, 375, 390, 414, 768, 1024, 1440**. The measurement script checks visible buttons, `.button` links, text/date inputs and selects; this is not a blanket claim about every text link or a formal WCAG audit. Enlarged text (200%), reduced motion, long Vietnamese event content, keyboard navigation, notification Escape/focus and dialog/save-button reachability are also covered.

### Resolved test environment issues

The first fixture was nested under `.next`; Tailwind scanned build caches and screenshot navigation timed out. Moving the fixture outside those caches resolved it without modifying application build configuration.

The first browser matrix lacked a complete WebKit executable. Installing WebKit also garbage-collected Chromium's temporary cache while an account test was running: that account attempt ended with 7 passes and 8 infrastructure failures. Browser binaries were restored with `PLAYWRIGHT_SKIP_BROWSER_GC=1`, and the affected account suite was rerun. No test assertion or production behavior was weakened to accommodate the missing binaries.

WebKit/macOS uses Option+Tab to include links in keyboard navigation; the new keyboard test now uses that key for WebKit on macOS. The failed initial assertion and successful three-browser rerun are accounted for above.

### Reproduction

Use a separate checkout/copy with no real `.env`, the lockfile dependencies and generated Prisma client. The review used a disposable copy under `/tmp`, the original test runner and existing Playwright browser projects. No production database, bucket, SMTP account or VPS was contacted.

```sh
# In the isolated app copy:
MORY_DATA_MODE=demo npm run build
MORY_DATA_MODE=demo npm run start -- --hostname 127.0.0.1 --port 3107

# In the review checkout, against that instance:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3107 PLAYWRIGHT_PRODUCTION=1 MORY_BROWSER_MATRIX=1 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3107 node review/ui-ux-pro-max/capture-demo.mjs after

# Existing runner creates and removes its own PostgreSQL/storage/SMTP resources.
# Set MORY_TEST_APP_ROOT to the isolated app copy's absolute path.
MORY_UI_REVIEW_PHASE=after MORY_INTEGRATION_TEST_FILTER=family-sharing.test.ts node scripts/test-database.mjs --e2e --media --email --reminders
```

Set `PLAYWRIGHT_BROWSERS_PATH` when using a temporary browser cache. Install browsers before running suites; use `PLAYWRIGHT_SKIP_BROWSER_GC=1` if sharing that cache. The baseline capture used the same test infrastructure against unmodified `89439df` in dev mode; final captures used production. Some baseline dialog screenshots include an animation frame; after screenshots disable screenshot animations for stable evidence.

## Business preservation checklist

- [x] Only the six presentation files below changed in production source; no callback, hook, action payload or business condition changed.
- [x] Routes/destinations, child selection and account/family navigation remain available.
- [x] Same form schemas, defaults, data fields, validation and submit handlers.
- [x] Demo onboarding, create/edit, upload validation, date/created-time preservation, search/filtering, child switching and reload persistence tested.
- [x] Born/expecting state, birth confirmation, paused journeys, lunar/confirmed/custom milestones retain existing semantics.
- [x] Server signup, login/logout, verification/reset, cross-family isolation and stale viewer permissions tested.
- [x] Server media/privacy/reminder/family suite passed, including viewer restrictions, revoked invitations, member removal and private asset isolation.
- [x] PWA manifest/offline/private-cache and CSP/nonce tests pass in browser coverage.
- [x] No Prisma, migrations, APIs, Server Actions, server services, domain rules, worker, infrastructure/config or dependency changes.
- [x] No new product feature, mock production data, decorative action, or removed existing control.

## Files changed

| Files | Purpose |
| --- | --- |
| `tokens.css` | Local typography, body/label scale, shared layout/shadow tokens |
| `src/app/globals.css` | Map legacy aliases to existing semantic tokens |
| `src/app/ui-review.css` | Shared presentation, responsive, safe-area, focus/motion and state styling |
| `src/app/welcome/welcome.module.css` | Space between create-family action and existing invitation entry |
| `src/components/layout/app-shell.tsx` | Skip link/main target and full selected-child name hints only |
| `src/features/app/views.tsx` | Existing filter selected-state accessibility only |
| `tests/e2e/ui-modernization.spec.ts` | Seven-width/navigation/dialog, keyboard/filter, long text/200%/reduced-motion regression checks |
| `tests/account-e2e/ui-modernization.spec.ts` | Isolated account/family/invite responsive checks and masked evidence capture |
| `review/ui-ux-pro-max/**` | Audit, recommendation, plan, report, comparison viewer, capture utility and screenshots/measurements |

## Limits and exclusions

Browser device emulation is not testing on physical Android/iPhone hardware or an installed PWA/OS keyboard. Contrast measurements cover the shared token pairs, not every possible photo/background. No formal screen-reader certification is claimed. The existing isolated storage test uses MinIO's S3-compatible endpoint; this UI task does not certify a live RustFS deployment.

No dark-mode feature, external fonts, password toggle, drafts/autosave, undo, realtime collaboration, upload-workflow changes, new notification mechanism, navigation destination, role/status/category, API or schema was added. These would require separate product/business work. No dependency or CSP/security policy change was needed.
