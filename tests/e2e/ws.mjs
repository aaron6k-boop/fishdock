// A minimal WebSocket server side (RFC 6455: text frames, ping, close) for the local end-to-end server, so Fish
// Together can be tested in a browser with no packages and no network.
import { createHash } from "node:crypto";

export function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let buf = Buffer.alloc(0), open = true;
  const frame = (op, payload) => {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | op, 127, 0, 0, 0, 0]), Buffer.from([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255])]);
    return Buffer.concat([head, payload]);
  };
  const ws = {
    onmessage: null, onclose: null,
    send(text) { if (open) socket.write(frame(1, Buffer.from(text))); },
    close(code = 1000, why = "") { if (!open) return; open = false; const p = Buffer.alloc(2 + Buffer.byteLength(why)); p.writeUInt16BE(code, 0); p.write(why, 2); socket.write(frame(8, p)); socket.end(); ws.onclose?.(); },
  };
  socket.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; }
      const mOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) { const m = buf.subarray(mOff, mOff + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i % 4])); }
      buf = buf.subarray(off + len);
      if (op === 1) ws.onmessage?.(payload.toString());
      else if (op === 8) { if (open) { open = false; socket.end(); ws.onclose?.(); } return; }
      else if (op === 9) socket.write(frame(10, payload));
    }
  });
  const gone = () => { if (open) { open = false; ws.onclose?.(); } };
  socket.on("close", gone); socket.on("error", gone);
  return ws;
}
