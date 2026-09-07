export const MEMBER_IMAGE_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';
export const MAX_RAW_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 500 * 1024;
export const MAX_SAMPLES_PER_MEMBER = 1000;
export const MAX_SAMPLES_PER_UPLOAD = 100;

export function isJpegOrPngFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png') {
    return true;
  }
  if (type && type !== 'application/octet-stream') {
    return false;
  }
  const name = file.name.toLowerCase();
  return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
}

function jpegFileName(original: string): string {
  const base = original.replace(/\.[^.]+$/, '') || 'avatar';
  return `${base}.jpg`;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('jpeg encode failed'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/** Downscale + JPEG quality until the file is ≤ maxBytes. */
export async function compressImageToJpeg(file: File, maxBytes = MAX_AVATAR_BYTES): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxSides = [1920, 1600, 1280, 1024, 800, 640, 480];
    const qualities = [0.82, 0.72, 0.62, 0.5, 0.4, 0.32];
    let last: Blob | null = null;

    for (const side of maxSides) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('canvas');
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of qualities) {
        const blob = await canvasToJpegBlob(canvas, quality);
        last = blob;
        if (blob.size <= maxBytes) {
          return new File([blob], jpegFileName(file.name), { type: 'image/jpeg' });
        }
      }
    }

    if (!last) {
      throw new Error('compress failed');
    }
    return new File([last], jpegFileName(file.name), { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

