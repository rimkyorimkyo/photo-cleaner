/**
 * Image Optimizer, Perceptual Hash (dHash) & Compressor
 * Helps users clean storage and downscale heavy photos.
 */

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Creates a lightweight thumbnail for fast mobile grid display
 */
export async function createThumbnail(blob, maxDim = 360) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Fast webp or jpeg
      canvas.toBlob((thumbBlob) => {
        resolve({
          thumbBlob,
          thumbUrl: URL.createObjectURL(thumbBlob),
          origWidth: img.naturalWidth,
          origHeight: img.naturalHeight
        });
      }, 'image/webp', 0.7);
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

/**
 * Calculates a 64-bit difference hash (dHash) for duplicate & similar photo detection
 */
export async function computeDHash(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // 9x8 grid: compares 8 rows of 9 pixels (8 comparisons per row = 64 bits)
      canvas.width = 9;
      canvas.height = 8;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 9, 8);

      const imgData = ctx.getImageData(0, 0, 9, 8).data;
      let hash = '';

      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const idxLeft = (y * 9 + x) * 4;
          const idxRight = (y * 9 + (x + 1)) * 4;

          // Simple luminance
          const lumLeft = imgData[idxLeft] * 0.299 + imgData[idxLeft + 1] * 0.587 + imgData[idxLeft + 2] * 0.114;
          const lumRight = imgData[idxRight] * 0.299 + imgData[idxRight + 1] * 0.587 + imgData[idxRight + 2] * 0.114;

          hash += (lumLeft > lumRight ? '1' : '0');
        }
      }

      resolve(hash);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

/**
 * Hamming Distance between two 64-bit binary strings
 */
export function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

/**
 * Group similar photos based on perceptual hash
 * Threshold <= 10 indicates high similarity or burst-shot photos
 */
export function groupSimilarPhotos(photos, threshold = 10) {
  const groups = [];
  const visited = new Set();

  for (let i = 0; i < photos.length; i++) {
    const p1 = photos[i];
    if (visited.has(p1.id) || !p1.dhash || p1.isTrash) continue;

    const currentGroup = [p1];
    visited.add(p1.id);

    for (let j = i + 1; j < photos.length; j++) {
      const p2 = photos[j];
      if (visited.has(p2.id) || !p2.dhash || p2.isTrash) continue;

      const dist = hammingDistance(p1.dhash, p2.dhash);
      if (dist <= threshold) {
        currentGroup.push(p2);
        visited.add(p2.id);
      }
    }

    if (currentGroup.length > 1) {
      groups.push(currentGroup);
    }
  }

  return groups;
}

/**
 * Compresses an image blob into webp/jpeg with optimized quality and dimension
 */
export async function compressImage(blob, quality = 0.8, maxDim = 1920) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((compressedBlob) => {
        if (!compressedBlob) {
          reject(new Error('Compression failed'));
          return;
        }
        resolve({
          blob: compressedBlob,
          size: compressedBlob.size,
          width,
          height,
          savedBytes: Math.max(0, blob.size - compressedBlob.size)
        });
      }, 'image/webp', quality);
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}
