"use client";

import { upload } from "@vercel/blob/client";
import { getAccessToken, authFetch, ensureSession } from "@/lib/client-auth";
import {
  guessMime,
  isAllowedMime,
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

/** Server path works up to ~3.5MB on Vercel; larger files use client direct Blob. */
const SERVER_SAFE_BYTES = 3.5 * 1024 * 1024;

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
    throw new Error(data.error || `Server upload failed (${res.status})`);
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

async function uploadViaClient(
  file: File,
  opts: UploadOptions,
  mime: string,
  token: string
): Promise<UploadResult> {
  const album =
    (opts.album || "general")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 40) || "general";
  const safeName =
    file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "file";

  let blob;
  try {
    blob = await upload(`${album}/${safeName}`, file, {
      access: "public",
      handleUploadUrl: "/api/upload/blob",
      // multipart helps large files; also OK for 14MB+
      multipart: file.size > 4 * 1024 * 1024,
      contentType: mime,
      clientPayload: JSON.stringify({
        album,
        expiry: opts.expiry || "never",
        isPublic: !!opts.isPublic,
        contentType: mime,
        size: file.size,
      }),
      headers: {
        "x-auth-token": token,
      },
    });
  } catch (e: any) {
    const raw = e?.message || String(e);
    throw new Error(`Direct upload failed: ${raw}`);
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
    // File is on Blob but meta failed — still surface URL if possible
    if (blob?.url) {
      throw new Error(
        data.error ||
          `File uploaded but library save failed (${complete.status}). URL: ${blob.url}`
      );
    }
    throw new Error(data.error || `Save metadata failed (${complete.status})`);
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

/** Direct-to-Blob for large files; server put for small ones. Max 500 MB. */
export async function uploadMediaFile(
  file: File,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_LABEL})`);
  }

  const mime = guessMime(file.name, file.type || "");
  if (!isAllowedMime(mime) && !file.type) {
    // allow if extension mapped; if still octet-stream with no known ext, reject
    if (mime === "application/octet-stream") {
      throw new Error("Invalid type — image, video, audio, or HTML only");
    }
  }
  if (!isAllowedMime(mime)) {
    throw new Error(`Invalid type (${mime || file.type || "unknown"})`);
  }

  await ensureSession();
  const token = getAccessToken();
  if (!token) {
    throw new Error("Login required");
  }

  // Small files: simple server path (more reliable)
  if (file.size <= SERVER_SAFE_BYTES) {
    try {
      return await uploadViaServer(file, opts, mime);
    } catch (e: any) {
      // fall through to client if server rejects size
      const msg = e?.message || "";
      if (!/too large|body|413|payload/i.test(msg)) {
        throw e;
      }
    }
  }

  return uploadViaClient(file, opts, mime, token);
}
