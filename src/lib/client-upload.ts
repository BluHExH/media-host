"use client";

import { put } from "@vercel/blob/client";
import { getAccessToken, authFetch, ensureSession } from "@/lib/client-auth";
import {
  guessMime,
  isAllowedMime,
  mediaDisabledMessage,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
} from "@/lib/media-mime";

export type UploadOptions = {
  album?: string;
  expiry?: string;
  isPublic?: boolean;
};

export type UploadResult = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  album: string;
  previewUrl?: string;
};

const SERVER_SAFE_BYTES = 3.5 * 1024 * 1024;

function errText(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const any = e as any;
  if (any.message && String(any.message).trim()) return String(any.message);
  if (any.cause?.message) return String(any.cause.message);
  if (any.error) return String(any.error);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function uploadViaServer(
  file: File,
  opts: UploadOptions,
  mime: string
): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("album", opts.album || "general");
  fd.append("expiry", opts.expiry || "never");
  if (opts.isPublic) fd.append("public", "1");

  const res = await authFetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Server upload failed (HTTP ${res.status})`);
  }
  return {
    url: data.url,
    pathname: data.pathname || "",
    contentType: data.contentType || mime,
    size: data.size || file.size,
    album: data.album || opts.album || "general",
    previewUrl: data.previewUrl,
  };
}

async function uploadViaClientToken(
  file: File,
  opts: UploadOptions,
  mime: string
): Promise<UploadResult> {
  const album = opts.album || "general";

  const tokRes = await authFetch("/api/upload/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ album, filename: file.name }),
  });
  const tokData = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok) {
    throw new Error(
      tokData.error || `Could not get upload token (HTTP ${tokRes.status})`
    );
  }
  if (!tokData.clientToken) {
    throw new Error("Upload token empty — check BLOB_READ_WRITE_TOKEN on Vercel");
  }

  let blob;
  try {
    blob = await put(tokData.pathname || file.name, file, {
      access: "public",
      token: tokData.clientToken,
      contentType: mime,
      multipart: file.size > 4 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error("Blob put failed: " + errText(e));
  }

  const complete = await authFetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: blob.url,
      pathname: blob.pathname,
      contentType: mime,
      size: file.size,
      album,
      expiry: opts.expiry || "never",
      isPublic: !!opts.isPublic,
    }),
  });
  const data = await complete.json().catch(() => ({}));
  if (!complete.ok) {
    throw new Error(
      data.error ||
        `Uploaded to CDN but library save failed (HTTP ${complete.status}). URL: ${blob.url}`
    );
  }

  return {
    url: data.url || blob.url,
    pathname: data.pathname || blob.pathname,
    contentType: data.contentType || mime,
    size: data.size || file.size,
    album: data.album || album,
    previewUrl: data.previewUrl,
  };
}

/** Small files → server; large files → client token + put. Max 500 MB. */
export async function uploadMediaFile(
  file: File,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_LABEL})`);
  }

  const mime = guessMime(file.name, file.type || "");
  const disabled = mediaDisabledMessage(mime);
  if (disabled) throw new Error(disabled);
  if (!isAllowedMime(mime)) {
    throw new Error(`Invalid type (${mime || file.type || "unknown"})`);
  }

  await ensureSession();
  if (!getAccessToken()) {
    throw new Error("Login required");
  }

  if (file.size <= SERVER_SAFE_BYTES) {
    try {
      return await uploadViaServer(file, opts, mime);
    } catch (e) {
      const msg = errText(e);
      if (!/too large|body|413|payload|Entity/i.test(msg)) {
        throw new Error(msg);
      }
    }
  }

  try {
    return await uploadViaClientToken(file, opts, mime);
  } catch (e) {
    throw new Error(errText(e));
  }
}
