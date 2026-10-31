// Request bodies, read with a size cap (audit S10, 30 Oct 2026).
//
// request.arrayBuffer() and request.text() read the whole body before anything can check its size,
// and a chunked upload has no Content-Length to check first. readCapped refuses a declared length
// over the cap before reading anything, then reads Request.body (a ReadableStream in Workers and in
// Node) chunk by chunk and stops, cancelling the stream, as soon as the bytes received pass the cap.

/** The body's bytes, or null when it's over `maxBytes` (declared or as it streams in). */
export async function readCapped(request, maxBytes) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => {}); // stop the upload: nothing more is read
      return null;
    }
    parts.push(chunk);
  }
  const out = new Uint8Array(total); // a fresh buffer of its own (a chunk can be a view into a larger one)
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

/** The body as UTF-8 text, or null when it's over `maxBytes`. */
export async function readCappedText(request, maxBytes) {
  const bytes = await readCapped(request, maxBytes);
  return bytes ? new TextDecoder().decode(bytes) : null;
}
