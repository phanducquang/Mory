import "server-only";

export class ResourceNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy dữ liệu trong gia đình đang chọn.");
    this.name = "ResourceNotFoundError";
  }
}
export class PersistenceConflictError extends Error {
  constructor(message = "Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.") {
    super(message);
    this.name = "PersistenceConflictError";
  }
}
export class MediaQuotaError extends Error {
  constructor() {
    super("Đã đạt giới hạn ảnh hoặc đang có ảnh chờ xử lý.");
    this.name = "MediaQuotaError";
  }
}
