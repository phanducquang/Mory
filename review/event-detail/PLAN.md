# Event detail UI/UX plan

Scope: presentation and photo viewing only. Keep event/media handlers, file validation/limits, permissions, API routes, storage and data contracts unchanged. Preserve demo inline-photo editing and server after-save uploads. Do not use the user's private photos/medical document as test evidence.

- [x] Inspect the existing page, gallery/media controls, dialog focus behavior and installed Next.js docs; read UI UX Pro Max.
- [x] Capture baseline with synthetic demo/account photos.
- [x] Rebuild detail layout: compact title/date/type/actions; aligned photo/story sections; one occurrence of metadata; separated event deletion.
- [x] Add manual slide gallery with full-image contain fit, thumbnail selection, visible previous/next controls and native swipe. No autoplay.
- [x] Add a large photo viewer with keyboard/escape, focus restoration and image zoom/scroll for reading portrait documents.
- [x] Put each existing delete-photo action on its corresponding photo; retain server permission/disabled/error states and file upload behavior.
- [x] Verify no-image/one/many images, deletion/update, long text, portrait/landscape, 320–1440px, keyboard, reduced motion, demo and server roles/media flows.
- [ ] Capture after images, record checks, commit task-only changes and open a review PR. No merge/deploy.

## Audit and design choices

Current images use fixed-height cover crops and stack into a long mobile page. Delete actions live in an unrelated numbered list. The article and media manager have different widths, while large heading/action spacing pushes images below the fold. Dates repeat, and destructive controls lack a clear relationship to their target.

Reuse Mory's reviewed purple/paper tokens and local typography. UI UX Pro Max searches verified keyboard/focus and manual carousel controls, large touch targets and destructive-action clarity. Generic object-cover guidance is rejected for the main image: use contain so the full original is accessible. Keep the existing event deletion confirmation. Place direct photo removal on the corresponding image, retaining the existing immediate delete outcome; no new API or authorization rule. Reuse the existing dialog focus trap for the viewer.

No new photo data, captions, albums, downloads, sharing, reorder or backend feature. A viewer/slide/zoom changes only how existing image URLs are presented. Metadata timestamps and full story remain available. Private image optimization/cache/auth rules stay unchanged (`unoptimized`, same-origin authenticated URLs).
