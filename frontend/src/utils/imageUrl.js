import { BASE_URL } from "../services/api";

/**
 * Derives the backend server origin from BASE_URL (which points to e.g. https://backend.up.railway.app/api or http://localhost:5000/api).
 */
export function getBackendOrigin() {
  try {
    const url = new URL(BASE_URL, typeof window !== "undefined" ? window.location.origin : "http://localhost:5000");
    return url.origin;
  } catch {
    return "";
  }
}

/**
 * Resolves an image URL for safe client rendering:
 * 1. If empty or invalid, returns empty string.
 * 2. If already an external absolute URL (e.g. Cloudinary, Unsplash) and NOT pointing to our localhost uploads, returns as-is.
 * 3. If legacy localhost upload URL (http://localhost:.../uploads/...) or relative upload path (/uploads/...),
 *    normalizes the path and prepends the authoritative backend origin derived from VITE_API_URL.
 * 4. Preserves SVG data URIs as-is.
 *
 * @param {string} src - Raw image path or URL
 * @returns {string} Fully resolved, browser-accessible image URL
 */
export function resolveImageUrl(src) {
  if (!src || typeof src !== "string") return "";
  const trimmed = src.trim();
  if (!trimmed) return "";

  // Data URIs (e.g. SVG base64 preview) are self-contained
  if (trimmed.startsWith("data:")) return trimmed;

  // Match legacy localhost/127.0.0.1 upload URLs
  const localhostMatch = trimmed.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.+)$/i);
  if (localhostMatch && localhostMatch[3]) {
    const uploadPath = localhostMatch[3];
    const backendOrigin = getBackendOrigin();
    return backendOrigin ? `${backendOrigin}${uploadPath}` : uploadPath;
  }

  // Root-relative upload path (/uploads/...)
  if (trimmed.startsWith("/uploads/")) {
    const backendOrigin = getBackendOrigin();
    return backendOrigin ? `${backendOrigin}${trimmed}` : trimmed;
  }

  // Other URLs (e.g. Cloudinary, Unsplash, external CDNs) return unchanged
  return trimmed;
}
