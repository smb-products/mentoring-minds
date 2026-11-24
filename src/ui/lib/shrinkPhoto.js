/**
 * Shrinks a phone photo in the browser before it's sent: longest side 1600 px, JPEG 80%.
 * A 4 MB camera photo becomes about 250 KB, which keeps uploads quick on a phone,
 * storage small, and AI image reads at the size Claude reads best anyway (no gain above ~1600 px).
 * Files that aren't photos (PDFs) are returned unchanged.
 *
 * @param {File} file
 * @returns {Promise<{ file: File, base64?: string, mediaType?: string }>}
 */
export async function shrinkPhoto(file, maxSide = 1600, quality = 0.8) {
  if (!file?.type?.startsWith('image/') || typeof createImageBitmap !== 'function') return { file };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return { file, ...(await toBase64(file)) };
    const out = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    return { file: out, ...(await toBase64(out)) };
  } catch {
    return { file }; // an image the browser can't decode (e.g. HEIC on some desktops): send it as is
  }
}

async function toBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), mediaType: file.type };
}
