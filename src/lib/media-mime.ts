/** Shared MIME + size limits for uploads */

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_UPLOAD_LABEL = "500 MB";

/** Video & audio hosting paused */
export const VIDEO_DISABLED_MSG =
  "Video hosting is under development. Only images and HTML are available right now.";
export const AUDIO_DISABLED_MSG =
  "Audio hosting is under development. Only images and HTML are available right now.";

export function guessMime(name: string, type: string): string {
  if (type && type.startsWith("image/")) return type;
  if (type && type.startsWith("audio/")) return type;
  if (type && type.startsWith("video/")) return type;
  if (type && (type === "text/html" || type.startsWith("text/html"))) {
    return "text/html; charset=utf-8";
  }
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    heic: "image/heic",
    heif: "image/heif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    opus: "audio/opus",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
  };
  return map[ext] || type || "application/octet-stream";
}

export function isAllowedMime(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  // Video & audio temporarily disabled
  if (m.startsWith("video/") || m.startsWith("audio/")) return false;
  return m.startsWith("image/") || m.startsWith("text/html");
}

export function mediaDisabledMessage(mime: string): string | null {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("video/")) return VIDEO_DISABLED_MSG;
  if (m.startsWith("audio/")) return AUDIO_DISABLED_MSG;
  return null;
}

export function computeExpiry(daysRaw: string | null | undefined): Date | null {
  if (!daysRaw || daysRaw === "never" || daysRaw === "0") return null;
  const days = parseInt(String(daysRaw), 10);
  if (!days || days < 1) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.min(days, 3650));
  return d;
}

export function sanitizeAlbum(raw: string | null | undefined): string {
  return (
    String(raw || "general")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40) || "general"
  );
}
