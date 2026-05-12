/**
 * Client helper: POST a single image to /api/v1/uploads/image with the
 * wedding scope and return the public URL. Used by the Tiptap image
 * extension's drop/paste handlers.
 *
 * We deliberately don't expose progress here — the editor shows a generic
 * "uploading…" placeholder while this resolves. Adding real per-byte
 * progress would mean swapping to XHR; not worth the bytes for typical
 * sub-second uploads at our file caps.
 */

export interface UploadedImage {
  url: string;
  key: string;
  width: number;
  height: number;
}

export async function uploadImage(file: File, weddingId: string): Promise<UploadedImage> {
  const form = new FormData();
  form.set('image', file);
  form.set('wedding_id', weddingId);
  const res = await fetch('/api/v1/uploads/image', { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Image upload failed');
  }
  const data = json.data as UploadedImage | undefined;
  if (!data?.url) throw new Error('Upload returned no URL');
  return data;
}
