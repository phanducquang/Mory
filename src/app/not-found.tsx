import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-state">
      <h1>Mình đi lạc một chút rồi.</h1>
      <p>Cùng trở lại nơi những kỷ niệm được lưu giữ.</p>
      <Link className="button button-primary" href="/home">
        Về tổ ấm
      </Link>
    </main>
  );
}
