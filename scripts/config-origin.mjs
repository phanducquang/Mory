/** Shared by pre-install deployment validation and the server runtime. Never log URL values. */
export function readHttpOrigin(value, field) {
  let parsed;
  try { parsed = new URL(value ?? ''); }
  catch { throw new Error(`${field} không hợp lệ.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${field} phải là origin HTTP hoặc HTTPS, không có path, query, fragment hoặc credential.`);
  }
  return parsed;
}
