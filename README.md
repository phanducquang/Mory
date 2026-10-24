# Mory

**Memory + Story · Mỗi kỷ niệm, một câu chuyện.**

Ứng dụng Next.js PWA tiếng Việt, mobile-first, đồng hành từ thai kỳ đến trưởng thành. Repository được khởi tạo bằng `create-next-app` chính thức, dùng Next.js **16.4.2**, React **19.3.0**, TypeScript strict, Tailwind CSS, Lucide, React Hook Form và Zod.

## Chạy local

Hướng dẫn chạy **trực tiếp trên VPS Ubuntu, không cần Docker**: [run-and-deploy-pm2.md](docs/run-and-deploy-pm2.md), gồm cài Node.js/PostgreSQL, cấu hình môi trường, PM2, Nginx/HTTPS và startup sau reboot. Script: `./deploy.sh` (thêm `--migrate` khi chủ động áp dụng migrations).

Yêu cầu Node.js 22.12+ và npm.

```sh
npm ci
npm run dev
```

Mở http://localhost:3000. Không cần database, secret hay tài khoản để dùng bản demo.

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

Playwright tự khởi động dev server nếu chưa có; đặt `PLAYWRIGHT_BASE_URL` để dùng server đang chạy. PWA service worker chỉ đăng ký ở production (`npm run build && npm start`), hỗ trợ HTTPS hoặc localhost.

## Trạng thái thực tế

- **Implemented:** app shell responsive desktop/mobile; nhiều hồ sơ bé; onboarding thai kỳ/sau sinh; dashboard; timeline có tìm kiếm, lọc loại/thời gian, sắp xếp và tải thêm; tạo/sửa/xóa sự kiện; ngày diễn ra riêng với timestamp; ảnh có kiểm tra MIME, chữ ký và giới hạn; hồ sơ, xác nhận chào đời, tạm dừng/kết thúc hành trình; chọn và xác nhận ngày cột mốc; xuất dữ liệu JSON; manifest, install/update support, offline fallback; unit tests và Playwright E2E.
- **Demo only:** dữ liệu mẫu và mutation lưu trong `localStorage` trên trình duyệt. Dữ liệu có thể mất; đây **không phải** cơ chế lưu trữ an toàn cho thông tin trẻ em. Chỉ dùng thông tin giả lập. Có thông báo giới hạn trong Cài đặt và giao diện. Tùy chọn nhắc nhở chỉ lưu cấu hình, chưa gửi thông báo.
- **Implemented milestone domain:** lifecycle, sinh nhật dương lịch/29-02, bộ lịch Việt Nam UTC+7 với fixtures đối chiếu và kiểm tra hai chiều; gợi ý đầy tháng/thôi nôi theo quy tắc gia đình; cột mốc tự động trên timeline; cột mốc riêng có thể để trống ngày. Hỗ trợ năm âm lịch 1976–2100; ngoài phạm vi không đoán ngày. Ngày tổ chức luôn cần gia đình xác nhận. Xem [phạm vi và kiểm chứng lịch](docs/lunar-calendar-verification.md).
- **Implemented data layer:** Prisma 7.10.1 + PostgreSQL repository theo family; kiểm tra membership/role; transaction cho lifecycle, event/cột mốc, quota ảnh và hàng đợi dọn ảnh. Có migration SQL và integration tests trên PostgreSQL 17 dùng riêng cho kiểm thử. Xem [hướng dẫn database](src/server/db/README.md).
- **Implemented account mode (Phase 5A):** Better Auth email/mật khẩu, session PostgreSQL, đăng ký bật/tắt bằng cấu hình, tạo gia đình, đăng xuất, dữ liệu server nối UI và Server Actions có validation/phân quyền. Timeline tìm kiếm tiếng Việt/phân trang tại DB; dữ liệu tài khoản không ghi vào localStorage. Bật bằng `MORY_DATA_MODE=server` cùng DB/origin/secret đã cấu hình; mặc định vẫn là demo. Xem [hướng dẫn tài khoản](docs/authentication.md).
- **Implemented private media (Phase 5B):** private S3 qua session, xác minh/chuẩn hóa WebP và bỏ metadata, ảnh sự kiện/avatar, quota và worker expiry/cleanup/reconciliation có retry. Có [hướng dẫn RustFS](docs/rustfs.md) và compatibility check; integration fixture hiện có dùng MinIO. Bật riêng bằng `MORY_MEDIA_ENABLED=true`; xem [cấu hình và vận hành ảnh](docs/private-media.md).
- **Implemented email (Phase 5C):** xác minh email, đặt lại mật khẩu, thu hồi session, SMTP outbox mã hóa có lease/retry/expiry; bật riêng theo [hướng dẫn](docs/account-email.md).
- **Implemented reminders (Phase 5D):** scheduler nhắc lịch email theo opt-in, idempotent và kiểm tra quyền trước SMTP; [hướng dẫn](docs/reminders.md).
- **Implemented privacy/recovery (Phase 5E):** audit metadata theo family, reauthentication, ownership transfer, account/family deletion với cleanup, retention và backup/restore AES-GCM có deletion ledger; [runbook](docs/privacy-backup.md).
- **Implemented security/QA/operations (Phase 5F):** CSP nonce, trusted-edge throttling, browser/device emulation và operations review; [security/operations](docs/security-operations.md).
- **Acceptance bên ngoài:** TLS/DNS/SMTP delivery/provider rights/offsite DR và thiết bị thật vẫn cần bằng chứng vận hành; không suy ra từ test local.

## Kiến trúc

App Router layouts/pages đọc dữ liệu theo mode: demo có browser repository riêng; account mode đọc dữ liệu ban đầu từ service phía server và mutation qua Server Actions. Business rules tách trong `features/*`, `lib/dates`, `lib/lunar-calendar`; server service gọi repository trực tiếp, không tự gọi HTTP nội bộ và không dùng global in-memory database. Chỉ chạy migration trên database Docker tạm để kiểm thử; chưa cấu hình hoặc thay đổi database bên ngoài, triển khai hay push code.

Service worker chỉ cache static assets công khai được chỉ định. Không cache trang cá nhân, API, RSC hay ảnh gia đình. Khi offline và mở trang mới, ứng dụng hiển thị fallback; chưa hỗ trợ mở lại toàn bộ dashboard offline.

## Tài liệu

- [RustFS trực tiếp trên Ubuntu và kiểm tra S3 compatibility](docs/rustfs.md)
- [Rà soát UI theo Hallmark](docs/ui-review-hallmark.md)
- [Kiến trúc](docs/architecture.md)
- [Yêu cầu sản phẩm](docs/product-requirements.md)
- [Design system](docs/design-system.md)
- [Quy tắc cột mốc](docs/milestone-rules.md)
- [Kiểm chứng lịch Việt Nam](docs/lunar-calendar-verification.md)
- [Tài khoản, session và cấu hình server](docs/authentication.md)
- [Ảnh riêng tư và worker bảo trì](docs/private-media.md)
- [Email verification/recovery](docs/account-email.md)
- [Nhắc lịch email](docs/reminders.md)
- [Audit/xóa dữ liệu/backup và restore](docs/privacy-backup.md)
- [Security và vận hành](docs/security-operations.md)
- [Roadmap và báo cáo phase](docs/development-roadmap.md)

`docker compose` có profile tùy chọn `services` cho PostgreSQL/MinIO để phát triển, không tự chạy migration. `.env.example` không chứa credentials thật. Để bật account mode, cần cấu hình DB, origin, secret và `MORY_DATA_MODE=server` theo hướng dẫn tài khoản.

`npm ci` tự tạo Prisma client, không cần database. Kiểm thử persistence độc lập với dữ liệu local hiện có:

```sh
npm run db:validate
npm run test:db
```

`test:db` cần Docker; tạo PostgreSQL 17 với mật khẩu ngẫu nhiên trong bộ nhớ, cổng localhost ngẫu nhiên, áp dụng migration và tự xóa container. `npm run db:migrate` là lệnh riêng chỉ chạy khi bạn đã cấu hình và muốn thay đổi database tương ứng.

Kiểm thử account mode đầy đủ: `npm run test:account` (cần Docker và Chromium của Playwright). Lệnh build rồi mở DB/server localhost tạm, chạy integration + account E2E và tự dọn. Mặc định đăng ký bị tắt; dữ liệu demo không tự nhập vào tài khoản.

Kiểm thử cả private media: `npm run test:media`; runner thêm MinIO/bucket private dùng tạm, chạy CLI worker và account/media E2E. Worker vận hành chạy riêng từng lượt bằng `npm run media:maintain`; xem [hướng dẫn](docs/private-media.md).

Ảnh minh họa công khai từ Unsplash: [ảnh em bé](https://images.unsplash.com/photo-1519689680058-324335c77eba), [ảnh gia đình](https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4). Đây chỉ là ảnh minh họa demo, không phải ảnh người dùng.

## Kết quả kiểm tra

Ngày **24/10/2026**: rà soát UI theo Hallmark và bổ sung hướng dẫn/compatibility check RustFS. **115 unit**, **16 journey E2E trên standalone production**, **2 deployment tests với PM2 cô lập**, lint, typecheck và build production pass. Kiểm tra UI 50 lượt theo 10 màn hình × 5 chiều rộng; xem [phạm vi và giới hạn](docs/ui-review-hallmark.md). Chưa kết nối hay nghiệm thu instance RustFS thật; cần chạy [storage check/probe](docs/rustfs.md) trên phiên bản đích.

Ngày **19/10/2026**: đã hoàn tất các phase phát triển trong repo tới **5F**. **98 unit**, **60 integration**, **12 account E2E**, **54 demo/PWA/CSP E2E** (desktop Chromium, Android Chromium, iPhone WebKit emulation) pass. Lint, strict typecheck, Prisma validation, calendar reproducibility, production Docker build/smoke UID 1001 và backup/privacy worker checks pass. Image app cuối: `mory:phase5f-final`. Runtime audit 0 vulnerabilities; tooling ESLint chain còn 5 high như ghi bên dưới. Test infrastructure local đã được dọn; không push/merge/deploy hoặc thay DB/bucket/SMTP ngoài.

Backup/restore snapshot DB + ảnh đã có drill thật trên local, gồm wrong key/tamper/nonempty target/rollback/deletion ledger. Timeline query thật với 5000 events/20 samples: median 7.44 ms, p95 10.21 ms tại local, không phải production SLA. Chi tiết theo [roadmap](docs/development-roadmap.md), [runbook](docs/privacy-backup.md) và [acceptance còn mở](docs/acceptance.md). Browser emulation không thay thế kiểm tra thiết bị thật.

```sh
docker build -t mory:check .
node scripts/test-database.mjs --email --media --reminders --e2e --app-image mory:check
MORY_BROWSER_MATRIX=1 node scripts/test-production-image.mjs mory:check
```

Các kết quả bên dưới là lịch sử từng phase.


Ngày 18/10/2026, Phase 5B: **88 unit tests / 12 files**, **28 PostgreSQL/MinIO integration tests / 3 files**, **7 account/media E2E** và **17 demo/responsive/PWA E2E** pass. Lint, TypeScript strict, Prisma validation và CLI worker pass. Production build/Docker clean install và smoke UID 1001 pass; cả hai bộ E2E chạy trên image cuối `mory:phase5b-check`. Host sandbox hiện chặn cổng nội bộ của Tailwind khi build; Docker production build hoàn tất, không bỏ qua TypeScript. Đã xem ảnh QA media mobile 390px. Target `mory:phase5b-worker` build và smoke imports/UID 1001/fail-closed khi thiếu cấu hình pass. Các container app/DB/MinIO và mạng kiểm thử đã được dọn; chưa thay đổi database/bucket ngoài hoặc deploy.

Để kiểm tra lại image production:

```sh
docker build -t mory:check .
node scripts/test-database.mjs --media --e2e --app-image mory:check
node scripts/test-production-image.mjs mory:check
```

Các kết quả Phase 5A bên dưới được giữ làm lịch sử.

Ngày 18/10/2026, Phase 5A: lint, TypeScript strict, Prisma validation và production build **pass**; **77 unit tests** (11 files), **21 PostgreSQL integration tests** và **4 E2E tài khoản trên production build cuối** pass. Hai migrations deploy thành công và deploy lại không có migration chờ; DB/server kiểm thử đã được dọn. Account E2E kiểm tra đăng ký/đăng nhập lại, persistence, cookie/session, family isolation, quyền VIEWER sau khi UI đã mở, action từ session hết hạn, xác nhận sinh/cột mốc và tìm kiếm tiếng Việt.

**17 E2E demo/responsive/PWA** trên build cuối và **Docker smoke test** image `mory:phase5a-check` đều pass. Kiểm tra responsive bao gồm 360/390/768/1024/1440px; đã xem ảnh QA login mobile và dashboard tài khoản. Fixtures lịch/45.654 ngày round-trip pass trong unit tests; generator không thay đổi trong Phase 5A. Test vét cạn có timeout riêng 20 giây để không phụ thuộc ngưỡng mặc định 5 giây khi host bận.

`npm audit --omit=dev`: **0 vulnerabilities**. Full audit còn 5 cảnh báo high theo chuỗi dependency của ESLint (`fast-glob`/`micromatch`/`braces`); registry hiện chưa có bản braces vá tương thích. Không force-fix xuống major framework lint cũ. Cần theo dõi tooling advisory trước production.

`npm start` dùng standalone server chính thức và chuẩn bị `public`/static assets bằng `scripts/start.mjs`. Có thể đặt cổng: `npm start -- --port 3001`. Docker image `mory:phase5a-check` đã build/smoke thành công: home, manifest/icons/static, auth bị tắt khi chưa bật account mode và UID 1001. Các container/server tạm đã được dọn; giữ image local. Chưa kiểm thử iOS/Android trên thiết bị thật hoặc deploy.

Để chạy PWA E2E, khởi động production server rồi chạy ở terminal khác:

```sh
PLAYWRIGHT_PRODUCTION=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- tests/e2e/pwa.spec.ts
```

Trạng thái cuối của các phase và acceptance còn lại Xem báo cáo từng phase trong [roadmap](docs/development-roadmap.md).

Bảng lịch được tạo bằng `npm run calendar:generate`; dùng `npm run calendar:check` để xác nhận khả năng tái tạo. Thư viện thiên văn chỉ dùng lúc phát triển; runtime không gọi dịch vụ chuyển đổi lịch bên ngoài.
