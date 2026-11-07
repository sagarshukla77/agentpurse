/** Upload validation by content, not by file name or the client's claimed type. */
export type UploadKind = 'pdf' | 'png' | 'jpeg';
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const MIME: Record<UploadKind, string> = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' };

export function sniffUpload(bytes: Uint8Array): UploadKind | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  return null;
}

/** Rejects anything over the size cap or whose bytes are not really a PDF/PNG/JPEG. */
export function validateUpload(base64: string): { ok: true; kind: UploadKind; mime: string; bytes: number } | { ok: false; reason: string } {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, reason: 'File data is not valid base64' };
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) return { ok: false, reason: `File must be between 1 byte and ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` };
  const kind = sniffUpload(buf);
  if (!kind) return { ok: false, reason: 'Only PDF, PNG and JPEG files are accepted' };
  return { ok: true, kind, mime: MIME[kind], bytes: buf.length };
}
