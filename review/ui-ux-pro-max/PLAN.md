# UI-only implementation plan

- [x] Fetch latest main, preserve uncommitted skill files, create feature branch, read project/Next.js/actual UI UX Pro Max instructions.
- [x] Inventory existing screens/actions and generate/review/persist skill recommendations with explicit brand-preserving overrides.
- [x] Capture baseline demo/account screenshots.
- [x] Standardize existing tokens/components and modernize existing screens, without changing handlers/routes/permissions.
- [x] Verify keyboard, long content, all seven target widths, reduced motion and text zoom; capture after screenshots.
- [x] Run feasible lint/typecheck/unit/demo/account/build checks; inspect behavior-preservation diff.
- [x] Commit only task files and create a review PR targeting main: [PR #1](https://github.com/phanducquang/Mory/pull/1). No merge or deployment performed.

## Explicitly excluded proposals

No new dark-mode toggle, password toggle, drafts/autosave, undo flow, realtime collaboration, upload workflow, notification mechanism, navigation destination, role/status/category, API, schema or dependency. No removal/hiding of existing actions. No external fonts/CSP/network changes. Existing full navigation across account/family boundaries remains intact even where generic stack advice suggests client routing.

## Expected implementation files

`tokens.css`, existing `src/app/ui-review.css` and `src/app/globals.css` where legacy aliases need alignment; small JSX-only changes in `app-shell.tsx`, `views.tsx`, existing UI/form/auth/family components and existing route render wrappers only when presentation requires it. Existing callbacks, hooks, validation constants and business conditions remain unchanged. Add review docs/screenshots and scoped visual/accessibility tests. No production file deletions planned.
