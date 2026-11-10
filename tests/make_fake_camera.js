// Writes a .y4m video of a QR code (fake camera for the browser test).
// Usage: node tests/make_fake_camera.js <text> <out.y4m>
const fs = require('fs');
const qrcode = require('../vendor/qrcode.js');
const [text, out] = process.argv.slice(2);
const q = qrcode(0, 'M'); q.addData(text); q.make();
const W = 640, H = 480, n = q.getModuleCount(), cell = Math.floor(300 / n);
const ox = Math.floor((W - n * cell) / 2), oy = Math.floor((H - n * cell) / 2);
const Y = Buffer.alloc(W * H, 235);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
  for (let y = 0; y < cell; y++) Y.fill(16, (oy + r * cell + y) * W + ox + c * cell, (oy + r * cell + y) * W + ox + (c + 1) * cell);
const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
const frames = [];
for (let i = 0; i < 30; i++) frames.push(Buffer.from('FRAME\n'), Y, UV);
fs.writeFileSync(out, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`), ...frames]));
