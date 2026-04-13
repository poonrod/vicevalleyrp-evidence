const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

export function assertAllowedMime(mime: string): void {
  const m = mime.toLowerCase();
  if (!ALLOWED.has(m)) {
    throw new Error(`MIME type not allowed: ${mime}`);
  }
}
