// Shared JPEG validation + metadata stripping for every image the server stores or sends on (ported from DetectDock).

/**
 * Validates a JPEG and returns a copy with every APPn (except a plain JFIF
 * header) and COM segment removed - this drops EXIF, GPS, XMP, ICC and
 * comments. Returns null for anything that isn't a sane, small JPEG.
 */
export function sanitizeJpeg(input, { maxBytes = 200 * 1024, maxDim = 1024, minDim = 32 } = {}) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 4 || b.length > maxBytes || b[0] !== 0xff || b[1] !== 0xd8) return null;
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  const out = [new Uint8Array([0xff, 0xd8])];
  let i = 2;
  let size = null;
  let scans = 0;
  let ended = false;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff && i < b.length) i++; // fill bytes
    const marker = b[i++];
    if (marker === 0xd9) {
      if (!scans) return null; // EOI before any image data
      out.push(new Uint8Array([0xff, 0xd9]));
      ended = true;
      break; // anything after the end of the image is dropped
    }
    if (marker >= 0xd0 && marker <= 0xd7) continue; // RSTn (no length)
    if (i + 2 > b.length) return null;
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) return null;
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (len < 7) return null;
      size = { h: (b[i + 3] << 8) | b[i + 4], w: (b[i + 5] << 8) | b[i + 6] };
    }
    if (marker === 0xda) {
      // Start of scan: copy the header, then the entropy-coded data up to the next
      // real marker (0xFF00 stuffing and RSTn belong to the data).
      scans++;
      out.push(new Uint8Array([0xff, 0xda]), b.subarray(i, i + len));
      let j = i + len;
      while (j < b.length) {
        if (b[j] === 0xff && j + 1 < b.length) {
          const n = b[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { j += n === 0xff ? 1 : 2; continue; }
          break;
        }
        j++;
      }
      out.push(b.subarray(i + len, j));
      i = j;
      continue;
    }
    const isJfif = marker === 0xe0 && len >= 7 && String.fromCharCode(...b.subarray(i + 2, i + 7)) === "JFIF\0";
    const isMeta = (marker >= 0xe0 && marker <= 0xef && !isJfif) || marker === 0xfe;
    if (!isMeta) out.push(new Uint8Array([0xff, marker]), b.subarray(i, i + len));
    i += len;
  }
  if (!ended) return null;
  if (!size || size.w < minDim || size.h < minDim || size.w > maxDim || size.h > maxDim) return null;
  const total = out.reduce((n, a) => n + a.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const a of out) {
    res.set(a, o);
    o += a.length;
  }
  return res;
}
