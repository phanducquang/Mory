# Event photo upload investigation

The initial report appeared phone-specific. The user then compared files and confirmed **216 KB succeeds, 2 MB fails**, including when comparing the same file across devices. This points to a payload-size boundary, rather than a Samsung-specific API or picker issue. The actual production response/status and VPS configuration were not available, so the exact rejecting proxy is not yet confirmed.

## Cause and correction

Mory's media API permits **8 MiB** images and already validates/decodes them before storing private WebP. The upload uses a Route Handler, not a Server Action, and the Next.js proxy matcher excludes `/api`. Increasing a Server Action limit does not fix this path.

A reverse proxy's lower limit can reject the photo before the Mory API runs. Nginx defaults to **1 MiB** and returns **HTTP 413** for a larger request. That fits the 216 KB / 2 MB observation. The application previously replaced any HTML/empty error response with the reported generic message, so it hid that status. [Nginx directive reference](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size).

The patch:

- Adds `config/nginx/media-upload.conf` for inclusion **inside the Mory web app's existing server block**, whether HTTP or HTTPS is used. It permits `9m` at the proxy, with `20s` body timeout, while retaining Mory's 8 MiB validation.
- Documents direct VPS configuration and reload steps in the root README. It does not alter TLS, auth headers, routing, caching, RustFS visibility or any existing virtual host automatically.
- Preserves API validation/permission errors and displays HTTP status plus actionable copy for HTML/empty errors, including 413, 401, 408/504 and 415. Proxy HTML is not shown. No image/cookie/token data is logged.
- Retains the current picker, file payload, image limits, supported formats, event/avatar endpoints, upload/delete behavior, storage access and authorization. No automatic compression, new image format, retry, database or storage change was added.

An initial investigation of mobile file transport was excluded after the same-file/different-size comparison narrowed the problem. No speculative file conversion or mobile-specific payload workaround remains in this patch.

## VPS action

In `/etc/nginx/sites-available/mory`, update the **existing server block actually serving Mory**:

```nginx
client_max_body_size 9m;
client_body_timeout 20s;
```

Alternatively include the tracked snippet by its absolute path in a stable checkout. Avoid duplicate directives. Check matching `location` blocks and any upstream CDN for a stricter limit. Then:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

This Nginx change can resolve an edge 413 without rebuilding Next.js. Redeploy the app for the improved error messages. RustFS's separate proxy limit does not control browser-to-Mory requests. The bucket remains private. No live VPS/Nginx/PM2/DB/bucket configuration was modified during this task.

## Verification

- 130 unit tests passed; typecheck, application-scoped lint and production build passed. Build/testing used a temporary source copy without the real `.env`.
- Isolated media integration: **9 passed**; account/browser media tests: **4 passed**. All owned test resources were removed. The new Galaxy S24/Chromium case selects a real disk-backed JPEG larger than 1 MiB, checks exact outgoing bytes, receives a simulated HTML 413, retries the same file against the real API/storage, reloads and deletes it. An initial test locator also matched Next.js’s route announcer; scoping it to the media region resolved that test-only failure without changing behavior. Existing tests retain spoofed/cross-origin/oversized rejection, private asset and viewer restrictions.
- Real Nginx check passed using a disposable `nginx:alpine` container and a local synthetic upstream: 216 KiB at the default limit → HTTP 204; 2 MiB at the default limit → HTTP 413; 2 MiB and 8 MiB with the tracked 9m snippet → HTTP 204. See [raw results](nginx-results.json). This checks the proxy limit independently; the separate account browser test exercises the actual image API/storage. The container was removed.

Android/Chromium emulation does not execute Samsung Internet or the native Android photo provider. The production fix still needs retesting with the 2 MB file after updating the active proxy configuration. No claim of a confirmed live HTTP 413 is made without the actual server response.
