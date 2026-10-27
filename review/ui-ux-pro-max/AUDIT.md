# Mory UI/UX audit

Baseline: `89439df` on latest fetched `main`. Work branch: `feature/ui-ux-pro-max`. Uncommitted `.agents/` belongs to the user and is excluded from commits. Scope: visual presentation, semantics, accessibility and responsive behavior only.

## Existing screens and preservation map

| Screen | Existing functionality / behavior to preserve | UI/UX and accessibility findings | UI-only treatment |
| --- | --- | --- | --- |
| App shell | `/home`, `/timeline`, `/events`, `/children`, `/settings`; active child selection; notifications; account menu; add event; PWA install/update | Small secondary text; mixed control sizes; no keyboard skip link; selected names ellipsized without full-value hint | Consistent rail/topbar, focusable main target, clear selected states, safe-area spacing, full-name titles |
| Home | Current child/age/lifecycle; true counts; recent events; next milestones; quick actions; birth confirmation | Dense stats, low-contrast legacy rules, inconsistent card rhythm; decorative art competes with content | Editorial hierarchy, readable summaries, quieter surfaces, same data and actions |
| Timeline | Search, type/period/order filters, pagination, grouped event/milestone projection, links | Tight filters, selected state only visual, constrained search, narrow content columns on mobile | Responsive filter controls, `aria-pressed`, readable cards and metadata; unchanged filter values/handlers |
| Events | Upcoming defaults, sorting, date grouping, create event | Same toolbar hierarchy/spacing issues as timeline | Shared presentation; unchanged upcoming semantics |
| Event details | Full event/photos, edit/delete, authenticated photo manager | Long descriptions/titles, inconsistent date/type hierarchy, destructive action proximity | Prose measure, balanced heading/actions, photo grid and separated danger styling |
| Event form | Same schema/date/type/time/reminder, demo image validation, server after-save photo flow | Small optional labels/helpers, dense field grouping, modal footer clearance | Shared field/button tokens and semantic group presentation; no validation/submit changes |
| Child profile | Selected child, profile edit/avatar, lifecycle, preferences and milestones | Many equally weighted panels; dense milestone rows; long names | Stronger profile heading, spaced sections, wrapping content and full-size existing controls |
| Child form | Born/expecting selection, dates, gender/rules, optional avatar, same save payload | Visually dense secondary options, inconsistent field rhythm | Consistent form surfaces and groups; all fields retained |
| Onboarding | Same first/additional child workflow and defaults | Decorative spacing outweighs instruction, narrow readable area | Calm intro, balanced form width and field spacing |
| Milestone dialogs | Family-confirmed dates, custom milestone creation, state actions | Packed date options and helper copy | Readable legends, grouped actions, full content preserved |
| Settings | Notifications, audit, privacy, family management, account/export/demo reset | Inconsistent cards/helper text/action placement | Shared section hierarchy and action layout; no action removed |
| Login/register | Better Auth email/password, signup flag, verification behavior | Inconsistent link spacing; long Vietnamese text in small auth cards | Balanced auth surfaces and controls; validation/auth calls untouched |
| Verify/forgot/reset | Existing token capture, request/click verification, reset and retry | States and long button labels need responsive clearance | Shared status/error styles and controlled wrapping; token handling untouched |
| Welcome | Create family, join by invitation, account link | Several links differ in spacing/weight | Clear primary/secondary rhythm, same destinations and form action |
| Account | Privacy deletion/reauth, logout | Long policy copy and danger grouping | Readable prose, deliberate section separators and controls |
| Family | Rename/select family, roster, OWNER invite/revoke/role/remove, non-owner leave | Wide controls and irregular roster columns; long names/links | Responsive roster, meaningful headings and action spacing; roles/conditions untouched |
| Join | Login/register/verification gate, code preview and explicit accept | Dense explanation; preview hierarchy | Same flow with clear input/help/preview/action presentation |
| Empty/loading/error/not-found/account-deleted | Existing fallback copy, retry/back controls and privacy explanation | Inconsistent spacing, headings and fallback link size | Shared readable state styling and preserved actions/copy |

All API routes, Server Actions, schema/migrations, services, repositories, date/lifecycle logic, role checks, authentication handlers, demo persistence, media verification and PWA worker are protected from edits.

## Prioritized findings

1. **High:** CSS has accumulated ~3,800 lines of legacy/layout/override rules; some small text and low-contrast colors survive outside the existing review scope. Keep layout rules and centralize approved presentation in the existing token/review layer.
2. **High:** Fixed bottom navigation/overlays can obscure focused content; apply consistent safe-area and scroll offsets without changing navigation behavior.
3. **High:** Forms, badges and secondary metadata use inconsistent scales. Increase body readability and unify touch targets without removing fields.
4. **Medium:** Whole-card links clip summaries while long titles/names need predictable wrapping and a way to access the existing full content route.
5. **Medium:** Filters and decorative SVGs need clearer selected-state semantics and less screen-reader noise.
6. **Medium:** Auth/family/settings cards lack a consistent section and action rhythm.

## Baseline verification limitation

`npm run lint` already fails on 15 `no-require-imports` errors in the user's untracked `.agents/skills/{brand,design-system}/scripts/*.cjs`, plus one unused-variable warning. These files are not application source and will not be edited or committed. Application lint will also be checked with `.agents/**` excluded, and the distinction retained in QA results.

Baseline and after screenshots are synthetic demo/disposable-account evidence only. Invitation/password/token fields must be masked. Physical device testing is outside this local browser review.
