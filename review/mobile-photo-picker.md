# Trình chọn ảnh trên mobile

## Thay đổi

- Các input ảnh sự kiện và ảnh đại diện dùng `accept="image/*"`, không đặt `capture`. Áp dụng cho tài khoản thật và demo, không phân nhánh theo hãng điện thoại.
- Trình duyệt/hệ điều hành quyết định giao diện và ứng dụng chọn ảnh. Web không ép mở Samsung Gallery, đổi tên mục Files hay phát hiện ứng dụng Bộ sưu tập để tự chọn ứng dụng dự phòng.
- Giữ nguyên API, cách gửi file, quyền gia đình, kiểm tra nội dung ảnh phía server và các giới hạn hiện tại: tài khoản thật hỗ trợ JPEG/PNG/WebP/AVIF tĩnh, tối đa 8 MiB/ảnh và 12 ảnh/sự kiện; demo hỗ trợ JPEG/PNG/WebP, tối đa 2 MiB/ảnh và 3 ảnh/sự kiện.
- Vì trình chọn có thể hiển thị thêm định dạng, client báo rõ khi chọn loại chưa hỗ trợ, gồm hướng dẫn chuyển HEIC/HEIF sang JPEG. File không có MIME vẫn đi qua kiểm tra server như trước; không suy đoán định dạng từ đuôi tên file.
- Input được reset sau chọn để chọn lại cùng file, giữ nguyên ảnh đã có khi hủy hoặc chọn file không hợp lệ.

## Kiểm chứng

- TypeScript, ESLint cho các file thay đổi, 122 unit test và production build: đạt.
- 9 kiểm thử browser (3 tình huống × Chromium desktop, Chromium Android mô phỏng, WebKit iPhone mô phỏng): đạt. Bao gồm chọn HEIC không được hỗ trợ, giữ ảnh khi hủy/chọn sai định dạng, chọn lại cùng ảnh, lưu/tải lại ảnh đại diện và xem gallery.
- 9 kiểm thử tích hợp media trên PostgreSQL và kho S3 tương thích tạm: đạt.
- 3 kiểm thử tài khoản (Chromium desktop, Chromium Android mô phỏng, WebKit iPhone mô phỏng): đạt. Xác nhận loại chưa hỗ trợ không gửi POST, chọn ảnh hợp lệ sau lỗi vẫn upload được, quyền riêng tư và xóa ảnh vẫn hoạt động. Bản sao kiểm thử mở rộng cấu hình account Playwright từ Chromium sang cả Chromium Android và WebKit iPhone; cấu hình mặc định của repo không thay đổi.

Kiểm thử sử dụng file tổng hợp và bản sao không có `.env`, không truy cập database/bucket thật. Test ảnh đại diện dùng selector cho phần hồ sơ đang hiển thị; các bản desktop/mobile ẩn trong DOM không phải ảnh cần kiểm tra. Test tài khoản có giả lập lỗi mạng chặn service worker trong context kiểm thử để `page.route` hoạt động ổn định, theo [hướng dẫn Playwright](https://playwright.dev/docs/api/class-page#page-route); service worker của ứng dụng không thay đổi.

## Cần kiểm tra trên thiết bị thật

Chưa có thiết bị thật kết nối trong phiên làm việc này. Mô phỏng trình duyệt không xác nhận được hộp thoại chọn ảnh native.

| Môi trường | Trạng thái |
| --- | --- |
| Android Chrome, gồm thiết bị ngoài Samsung | Chờ thiết bị thật |
| Samsung Internet | Chờ thiết bị thật |
| iPhone Safari | Chờ thiết bị thật |
| PWA Android và iOS | Chờ thiết bị thật |

Với mỗi môi trường: mở chọn ảnh; ghi nhận nguồn ảnh do hệ thống cung cấp; chọn ảnh có sẵn; hủy; chọn lại cùng file; chọn định dạng chưa hỗ trợ rồi chọn ảnh hợp lệ; tải ảnh và tải lại trang. Kiểm tra thêm trên Android không có ứng dụng Bộ sưu tập bên thứ ba để ghi nhận giao diện dự phòng do hệ thống cung cấp. Không dùng việc xuất hiện đúng nhãn “Bộ sưu tập” làm điều kiện bắt buộc.

## Nguồn

- [HTML Standard: accept là gợi ý cho trình duyệt](https://html.spec.whatwg.org/multipage/input.html#attr-input-accept)
- [MDN: accept không thay thế validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept)
- [MDN: capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)
