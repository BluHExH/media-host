"use client";

import { upload } from "@vercel/blob/client";
import { getAccessToken, authFetch, ensureSession } from "@/lib/client-auth";
import { guessMime, isAllowedMime, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/media-mime";

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

/** Direct-to-Blob upload (bypasses Vercel 4.5MB function body limit). Max 500 MB. */
export async function uploadMediaFile(
  file: File,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_LABEL})`);
  }

  const mime = guessMime(file.name, file.type);
  if (!isAllowedMime(mime)) {
    throw new Error("Invalid type — image, video, audio, or HTML only");
  }

  await ensureSession();
  const token = getAccessToken();
  if (!token) {
    throw new Error("Login required");
  }

  const album = (opts.album || "general").toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 40) || "general";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "file";

  const blob = await upload(`${album}/${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload/blob",
    multipart: file.size > 8 * 1024 * 1024,
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
