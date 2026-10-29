"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

function Photo({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return failed ? <span className="photo-failure"><ImageOff size={28} aria-hidden="true" />Chưa tải được ảnh. Hãy thử mở lại khi có kết nối.</span> :
    <><Image src={src} alt={alt} width={1600} height={1200} unoptimized loading={eager ? "eager" : "lazy"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />{!loaded && <span className="photo-loading" aria-hidden="true">Đang tải ảnh…</span>}</>;
}

/** Viewing state only. URLs and removal callbacks retain their existing contracts. */
export function EventPhotoGallery({ images, title, onRemove, busy = false }: {
  images: string[]; title: string; onRemove?: (url: string) => void; busy?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const openers = useRef<(HTMLButtonElement | null)[]>([]);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const index = Math.min(selected, images.length - 1);
  const count = images.length;

  function go(position: number) {
    const next = Math.max(0, Math.min(position, count - 1));
    const restore = !!track.current?.contains(document.activeElement);
    setSelected(next); setZoomed(false);
    track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: "instant" });
    if (restore) requestAnimationFrame(() => openers.current[next]?.focus({ preventScroll: true }));
  }
  function keyboard(event: KeyboardEvent) {
    if (zoomed || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : undefined;
    if (target === undefined) return;
    event.preventDefault(); go(target);
  }
  if (!count) return null;
  return <div className="event-gallery" role="region" aria-roledescription="bộ ảnh" aria-label="Ảnh của sự kiện">
    <div className="detail-photos photo-track" ref={track} tabIndex={0} aria-label="Vuốt hoặc dùng phím mũi tên để chuyển ảnh" onKeyDown={keyboard} onScroll={() => {
      const element = track.current;
      if (element?.clientWidth) setSelected(Math.max(0, Math.min(Math.round(element.scrollLeft / element.clientWidth), count - 1)));
    }}>
      {images.map((src, position) => <figure className="photo-slide" key={`${position}:${src}`} role="group" aria-roledescription="ảnh" aria-label={`${position + 1} / ${count}`} aria-hidden={position !== index}>
        <button type="button" ref={element => { openers.current[position] = element; }} className="photo-open" tabIndex={position === index ? 0 : -1} aria-label={`Xem ảnh ${position + 1} toàn màn hình`} onClick={() => { setSelected(position); setZoomed(false); setExpanded(true); }}>
          <Photo src={src} alt={`${title} - ảnh ${position + 1}`} eager={position === 0} />
        </button>
        {onRemove && <button type="button" className="photo-remove" disabled={busy} tabIndex={position === index ? 0 : -1} aria-label={`Xóa ảnh ${position + 1}`} title={`Xóa ảnh ${position + 1}`} onClick={() => onRemove(src)}><Trash2 size={18} aria-hidden="true" /></button>}
      </figure>)}
    </div>
    <div className="photo-controls">
      <p className="photo-position" aria-live={expanded ? "off" : "polite"} aria-atomic="true">Ảnh <strong>{index + 1}</strong> / {count}</p>
      <button type="button" className="photo-view-action" aria-label="Xem ảnh lớn" onClick={() => { setZoomed(false); setExpanded(true); }}><Expand size={16} aria-hidden="true" />Xem lớn</button>
      {count > 1 && <div className="photo-arrows"><button type="button" className="icon-button" aria-label="Ảnh trước" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={20} aria-hidden="true" /></button><button type="button" className="icon-button" aria-label="Ảnh tiếp theo" disabled={index === count - 1} onClick={() => go(index + 1)}><ChevronRight size={20} aria-hidden="true" /></button></div>}
    </div>
    {count > 1 && <div className="photo-thumbnails" aria-label="Chọn ảnh để xem">{images.map((src, position) => <button type="button" key={`${position}:${src}`} className="photo-thumbnail" aria-label={`Chọn ảnh ${position + 1}`} aria-pressed={index === position} onClick={() => go(position)}><Image src={src} alt="" width={80} height={80} unoptimized loading="lazy" /><span>{position + 1}</span></button>)}</div>}
    <Dialog open={expanded && index >= 0} title={`Ảnh ${index + 1} / ${count}`} onClose={() => { setExpanded(false); setZoomed(false); }} className="photo-viewer" overlayClassName="photo-viewer-overlay" onKeyDown={keyboard} returnFocus={() => openers.current[index] ?? null}>
      <div className="photo-viewer-content">
        <div className={`photo-viewer-stage${zoomed ? " is-zoomed" : ""}`} tabIndex={0} aria-label={zoomed ? "Ảnh phóng lớn, cuộn để xem toàn bộ" : "Ảnh đầy đủ"}
          onPointerDown={event => { swipeStart.current = !zoomed && event.pointerType === "touch" && event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null; }}
          onPointerCancel={() => { swipeStart.current = null; }}
          onPointerUp={event => {
            const start = swipeStart.current; swipeStart.current = null;
            if (!start || zoomed || event.pointerId !== start.id) return;
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
          }}>
          {index >= 0 && <Photo key={`${images[index]}-${zoomed}`} src={images[index]} alt={`${title} - ảnh ${index + 1}`} eager />}
        </div>
        <div className="photo-viewer-toolbar">
          <p aria-live="polite" aria-atomic="true">Ảnh {index + 1} / {count}</p>
          <button type="button" className="button button-secondary" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>{zoomed ? <ZoomOut size={18} aria-hidden="true" /> : <ZoomIn size={18} aria-hidden="true" />}{zoomed ? "Thu nhỏ" : "Phóng to"}</button>
          {count > 1 && <div className="photo-arrows"><button type="button" className="icon-button" aria-label="Ảnh trước" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={22} aria-hidden="true" /></button><button type="button" className="icon-button" aria-label="Ảnh tiếp theo" disabled={index === count - 1} onClick={() => go(index + 1)}><ChevronRight size={22} aria-hidden="true" /></button></div>}
        </div>
        <p className="photo-viewer-hint">{zoomed ? "Cuộn ảnh để xem từng chi tiết. Thu nhỏ để chuyển ảnh bằng phím mũi tên." : "Dùng nút mũi tên để chuyển ảnh. Nhấn Esc hoặc nút đóng để trở lại."}</p>
      </div>
    </Dialog>
  </div>;
}
