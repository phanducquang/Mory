import Link from "next/link";
export default function AccountDeletedPage() {
  return <main className="auth-page"><div className="auth-card"><h1>Đã đóng quyền truy cập</h1><p>Phiên đăng nhập đã bị thu hồi. Dữ liệu thuộc yêu cầu xóa đang được dọn khỏi cơ sở dữ liệu và kho ảnh; bước dọn hoàn tất sớm nhất sau 24 giờ và có thể lâu hơn khi dịch vụ gặp lỗi.</p><p>Bản sao lưu hết hạn theo chính sách lưu tối đa 30 ngày. Sổ yêu cầu xóa được dùng khi phục hồi để tránh khôi phục dữ liệu đã yêu cầu xóa.</p><Link href="/login">Về đăng nhập</Link></div></main>;
}
