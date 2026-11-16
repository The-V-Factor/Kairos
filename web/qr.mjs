import { qrcodegen } from './vendor/qrcodegen.mjs';

// Encode locally: login challenges must never be sent to an external image service.
export function qrSVG(text) {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.HIGH);
  const border = 4, size = qr.size + border * 2, paths = [];
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (qr.getModule(x, y)) paths.push(`M${x + border},${y + border}h1v1h-1z`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="iGPSPORT 登录二维码" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`;
}
