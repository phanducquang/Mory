"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>Trang này cần một chút thời gian</h2>
      <p>Dữ liệu demo vẫn nằm trong trình duyệt của bạn.</p>
      <button className="button button-primary" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
