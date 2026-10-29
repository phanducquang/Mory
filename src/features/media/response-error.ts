/** Proxies can return HTML/empty errors; never display that response body. */
export async function mediaResponseError(response: Response): Promise<string> {
  const result: unknown = await response.json().catch(() => null);
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error.trim()) return result.error;
  const status = `HTTP ${response.status}`;
  if (response.status === 413) return `Máy chủ từ chối dung lượng ảnh (${status}). Vui lòng thử ảnh nhỏ hơn hoặc báo quản trị viên kiểm tra giới hạn tải lên; Mory hỗ trợ tối đa 8 MB/ảnh.`;
  if (response.status === 401) return `Phiên đăng nhập đã hết hạn (${status}). Vui lòng đăng nhập lại.`;
  if (response.status === 408 || response.status === 504) return `Tải ảnh quá thời gian chờ (${status}). Kiểm tra kết nối và thử lại.`;
  if (response.status === 415) return `Định dạng ảnh chưa được hỗ trợ (${status}). Chọn JPEG, PNG, WebP hoặc AVIF.`;
  return `Chưa thể xử lý ảnh (${status}). Vui lòng thử lại; nếu lỗi tiếp diễn, gửi mã lỗi này cho quản trị viên.`;
}
