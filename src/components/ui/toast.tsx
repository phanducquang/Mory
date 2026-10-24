"use client";
import { Check, X } from "lucide-react";

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast" role="status">
      <span aria-hidden="true"><Check size={14} /></span>
      <p className="toast-message">{message}</p>
      <button type="button" className="toast-close" aria-label="Đóng thông báo" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
