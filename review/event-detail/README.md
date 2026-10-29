# Chi tiết sự kiện · UI/UX

Review: [Draft PR #3](https://github.com/phanducquang/Mory/pull/3). Nhánh `feature/event-detail-gallery`, từ main `23ca0bf`. [Kế hoạch và audit](PLAN.md). Thay đổi giới hạn ở cách trình bày/xem ảnh; không sửa business, API, schema, phân quyền, giới hạn ảnh, worker hoặc storage.

## Đã thay đổi

- Mobile hiển thị một ảnh đầy đủ theo slide, dùng `contain` thay cho crop. Có vuốt ngang, nút trước/sau, đếm ảnh và thumbnail. Không tự chạy slide.
- Chạm ảnh hoặc “Xem lớn” để mở viewer; hỗ trợ chuyển ảnh, vuốt, phóng to rồi cuộn để đọc ảnh dọc/tài liệu, Escape, focus trap và trả focus về đúng ảnh đang hiển thị.
- Xóa ảnh đặt ngay trên ảnh tương ứng, không còn danh sách nút “Xóa ảnh 1/2/3” tách rời. Dùng nguyên URL/callback DELETE cũ, trạng thái bận/lỗi và điều kiện `canWrite`; thao tác xóa ảnh vẫn có cùng kết quả tức thời. Không thêm workflow xác nhận ảnh mới.
- Cụm thêm ảnh chuyển thành control gọn cạnh tiêu đề bộ ảnh, vẫn là input file native với cùng handler/validation, MIME và giới hạn 8 MB/12 ảnh.
- Tiêu đề, loại, ngày/giờ và chỉnh sửa được nhóm lại; gallery/câu chuyện có cùng khung rộng, desktop hai cột và mobile một cột. Ngày ngắn `dd/MM/yyyy` không lặp, có thuộc tính `datetime` ISO; nội dung và timestamp lưu vẫn đầy đủ.
- Xóa sự kiện nằm ở vùng riêng và giữ hộp xác nhận/callback cũ. Demo vẫn sửa ảnh qua form hiện có; server vẫn tải ảnh sau khi lưu sự kiện. Avatar không dùng slide và giữ luồng hiện có.

## Skill và quyết định

Dùng UI UX Pro Max thực tế, đọc master hiện có và truy vấn `carousel swipe keyboard controls`, `destructive action target clarity`, `image gallery responsive sizing`/Next.js. Giữ màu tím/paper/local font của Mory. Áp dụng keyboard/focus, control chạm lớn, phương án thay thế gesture, không autoplay và phân biệt thao tác phá hủy. Hướng dẫn object-cover chỉ phù hợp thumbnail, bị loại cho ảnh chính. Tái sử dụng Dialog hiện có bằng props trình bày/keyboard/return-focus tùy chọn; những dialog cũ giữ mặc định.

## Bằng chứng

- [So sánh trước/sau](comparison.html) — mở file local trong trình duyệt.
- [Trước](before/) / [Sau](after/): demo, server, trạng thái chưa có ảnh, viewer ở 390/1440px; [đo sau](after/measurements.json).
- Tất cả ảnh là ảnh minh họa tạo cho test; account/child cũng giả lập và DB/bucket dùng một lần. Không dùng hay lưu vào repository ảnh y tế/ảnh gia đình trong screenshot người dùng.

## Kiểm chứng

| Hạng mục | Kết quả |
| --- | --- |
| Typecheck, lint ứng dụng | Passed |
| Unit | 122 passed |
| Production build | Passed trong fixture không có `.env` thật |
| Gallery demo | Slide/nút/thumbnail, keyboard, zoom/scroll, focus/Escape, 0/1/3 ảnh, bảy độ rộng, landscape và chữ 200% đã qua trên Chromium dev; touch input qua CDP trên Galaxy đã qua |
| Production browser matrix | 74 trường hợp đã được xác minh qua các lượt Chromium/Android Chromium/iPhone-WebKit; 1 ca touch CDP được skip trên WebKit. Lượt cuối kiểm tra navigation: 3 passed. Chi tiết các lượt bên dưới. |
| Account | 16 passed, gồm xóa đúng ảnh thứ hai, lỗi DELETE và thử lại, đọc private ảnh, viewer chỉ xem và xóa ảnh cuối; test màn chi tiết passed thêm một lần trên build cuối và ảnh đã làm mới |
| Family integration | 14 passed |
| Media integration | 9 passed ở lượt chạy lại; xem ghi chú baseline dưới đây |

Độ rộng: 320, 375, 390, 414, 768, 1024, 1440px. Kiểm tra thêm 844×390 và font 200%; không có tràn ngang ở bộ đo bảy độ rộng. Không có API/backend/validation/schema/dependency/service-worker/config change. So sánh AST xác nhận nguyên hàm media mutation và handler kiểm tra/chọn/upload file không thay đổi.

### Các lỗi/giới hạn đã ghi nhận

Lượt baseline trên main chưa sửa có hai assertion dọn object vật lý thất bại trong `tests/integration/media.test.ts`; lượt chạy lại trên hạ tầng dùng riêng qua 9/9 mà không thay backend hoặc sửa test. Đây là kết quả baseline không ổn định, không được báo thành mọi lượt đều xanh. Suite account được chạy độc lập với family integration để kiểm tra UI và quyền truy cập trực tiếp.

Ma trận browser đầu tiên phát hiện kỳ vọng ngày số ở WebKit không còn khớp ngày dài sau khi bỏ metadata lặp; header được giữ dạng ngày ngắn nhất quán. Một kiểm thử search có sẵn không nhận lần fill đầu trên WebKit khi tải đồng thời, đã qua khi chạy lại mà không đổi business/test expectation. Test gallery mới được sửa để chờ route timeline hoàn tất trước khi mở trang tiếp, tránh navigation race trên WebKit; kiểm tra lại ca này qua cả 3 browser. Lượt matrix đầu: 72 passed / 2 failed / 1 skipped; nhóm liên quan trên build cuối: 16 passed / 1 navigation-race failed / 1 skipped, rồi ca navigation chạy lại 3/3 passed. Không báo một lượt full matrix duy nhất xanh toàn bộ.

Kiểm thử mới phát hiện control gallery tràn ngang khi tăng chữ 200%; đã sửa reflow và chạy lại qua. Docker Desktop ban đầu chưa chạy; đã khởi động cho test local. Không có deployment hoặc sửa DB/bucket ngoài.

Browser emulation không thay thế Samsung Internet/thiết bị Samsung thật. Viewer dùng ảnh đã có và không thêm tải xuống, chia sẻ, thứ tự ảnh, album, caption, sửa ảnh hay format mới. No autoplay, dependency/font/CSP change, merge or deploy.

## Chạy lại

Dùng bản sao/check-out riêng không có `.env` production, build/start demo với `MORY_DATA_MODE=demo`. Sau đó:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3107 PLAYWRIGHT_PRODUCTION=1 MORY_BROWSER_MATRIX=1 npm run test:e2e
PLAYWRIGHT_BROWSERS_PATH=/path/to/browser-cache node --import tsx review/event-detail/capture.mts after
# MORY_TEST_APP_ROOT: đường dẫn tuyệt đối tới bản app cô lập đã build.
MORY_DETAIL_REVIEW_PHASE=after MORY_INTEGRATION_TEST_FILTER=family-sharing.test.ts node scripts/test-database.mjs --media --email --reminders --e2e
```

Runner tự tạo/xóa PostgreSQL, storage và SMTP riêng. Chụp baseline bằng source main trong fixture, `MORY_TEST_DEV=true`, `MORY_ACCOUNT_TEST_FILE=event-detail.spec.ts`, `MORY_DETAIL_REVIEW_PHASE=before`; chế độ before chỉ ghi bằng chứng, không tuyên bố kiểm thử UX mới đã qua.

## File thay đổi

- `src/features/media/event-photo-gallery.tsx`: UI slide/viewer/zoom và thao tác ảnh theo ngữ cảnh.
- `src/features/media/account-media-manager.tsx`: bố trí lại ảnh/control; nguyên mutation và file handler.
- `src/features/app/views.tsx`: chỉ phần render chi tiết sự kiện.
- `src/components/ui/dialog.tsx`: props trình bày, keyboard và return-focus tùy chọn; giữ mặc định cũ.
- `src/app/ui-review.css`: style có scope event detail/gallery/viewer.
- `tests/e2e/event-gallery.spec.ts`, `tests/e2e/photo-fixture.ts`, `tests/account-e2e/event-detail.spec.ts`: các ca UI, touch, read-only, DELETE recovery và ảnh giả lập.
- `review/event-detail/**`: kế hoạch, báo cáo, ảnh minh họa, số đo và helper chụp/so sánh.

`.gitignore` đang sửa của người dùng được giữ nguyên và loại khỏi commit.
