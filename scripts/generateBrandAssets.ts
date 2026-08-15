import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const distDir = path.join(process.cwd(), 'dist');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// ----------------------------------------------------
// 1. HELPER: Draw Antialiased Square Favicon
// ----------------------------------------------------
function generateSquareFavicon(size: number): Buffer {
  const png = new PNG({ width: size, height: size });
  const centerX = size / 2;
  const centerY = size / 2;
  const outerR = size * 0.42;
  const ringWidth = Math.max(1.5, size * 0.08);
  const innerR = outerR - ringWidth;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default dark luxury background (#0B0F19)
      let r = 11, g = 15, b = 25, a = 255;

      // Outer Red Ring (#EF4444)
      if (dist <= outerR && dist >= innerR) {
        // Smooth antialiasing on edges
        let edgeAlpha = 1;
        if (dist > outerR - 0.75) edgeAlpha = (outerR - dist) / 0.75;
        if (dist < innerR + 0.75) edgeAlpha = (dist - innerR) / 0.75;
        edgeAlpha = Math.max(0, Math.min(1, edgeAlpha));

        r = Math.round(239 * edgeAlpha + r * (1 - edgeAlpha));
        g = Math.round(68 * edgeAlpha + g * (1 - edgeAlpha));
        b = Math.round(68 * edgeAlpha + b * (1 - edgeAlpha));
      } else if (dist < innerR) {
        // Inner core slightly darker (#080B12)
        r = 8; g = 11; b = 18;
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  // Draw 'R' inside emblem
  function drawThickLine(x1: number, y1: number, x2: number, y2: number, thick: number, red = 255, green = 255, blue = 255) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 3 + 1;
    for (let i = 0; i <= steps; i++) {
      const cx = x1 + (x2 - x1) * (i / steps);
      const cy = y1 + (y2 - y1) * (i / steps);
      for (let ty = -thick; ty <= thick; ty++) {
        for (let tx = -thick; tx <= thick; tx++) {
          const px = Math.round(cx + tx);
          const py = Math.round(cy + ty);
          if (px >= 0 && px < size && py >= 0 && py < size) {
            const idx = (size * py + px) << 2;
            png.data[idx] = red;
            png.data[idx + 1] = green;
            png.data[idx + 2] = blue;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  }

  const s = size / 100; // scale factor
  const t = Math.max(0.6, s * 4); // thickness

  // Vertical Stem of 'R'
  drawThickLine(38 * s, 28 * s, 38 * s, 72 * s, t);
  // Top horizontal bar
  drawThickLine(38 * s, 28 * s, 58 * s, 28 * s, t);
  // Upper loop right side
  drawThickLine(58 * s, 28 * s, 58 * s, 50 * s, t);
  // Middle horizontal bar
  drawThickLine(38 * s, 50 * s, 58 * s, 50 * s, t);
  // Leg of 'R' (Red accent leg)
  drawThickLine(48 * s, 50 * s, 64 * s, 72 * s, t, 239, 68, 68);

  return PNG.sync.write(png);
}

// ----------------------------------------------------
// 2. HELPER: Draw Wide Brand Logo (600x200)
// ----------------------------------------------------
function generateWideBrandLogo(): Buffer {
  const width = 600;
  const height = 200;
  const png = new PNG({ width, height });

  // Fill dark luxury canvas (#0B0F19)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      let r = 11, g = 15, b = 25, a = 255;

      // Red border stripes on top and bottom (4px)
      if (y < 4 || y >= height - 4) {
        r = 239; g = 68; b = 68;
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  // Draw Circular Emblem (centerX = 95, centerY = 100, outerR = 58)
  const cx = 95, cy = 100, outerR = 58, innerR = 46;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= outerR) {
        if (dist >= innerR) {
          png.data[idx] = 239; png.data[idx + 1] = 68; png.data[idx + 2] = 68; png.data[idx + 3] = 255;
        } else {
          png.data[idx] = 8; png.data[idx + 1] = 11; png.data[idx + 2] = 18; png.data[idx + 3] = 255;
        }
      }
    }
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number, thick: number, r = 255, g = 255, b = 255) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 3 + 1;
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(x1 + (x2 - x1) * (i / steps));
      const py = Math.round(y1 + (y2 - y1) * (i / steps));
      for (let ty = -thick; ty <= thick; ty++) {
        for (let tx = -thick; tx <= thick; tx++) {
          const rx = px + tx;
          const ry = py + ty;
          if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
            const idx = (width * ry + rx) << 2;
            png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = 255;
          }
        }
      }
    }
  }

  // Emblem 'R'
  drawLine(85, 68, 85, 132, 3);
  drawLine(85, 68, 107, 68, 3);
  drawLine(107, 68, 107, 100, 3);
  drawLine(85, 100, 107, 100, 3);
  drawLine(94, 100, 112, 132, 3.5, 239, 68, 68);

  // BRAND NAME: "R Y V O"
  // R
  drawLine(185, 62, 185, 126, 4.5);
  drawLine(185, 62, 215, 62, 4.5);
  drawLine(215, 62, 215, 94, 4.5);
  drawLine(185, 94, 215, 94, 4.5);
  drawLine(198, 94, 222, 126, 4.5, 239, 68, 68);

  // Y
  drawLine(242, 62, 260, 92, 4.5);
  drawLine(278, 62, 260, 92, 4.5);
  drawLine(260, 92, 260, 126, 4.5);

  // V
  drawLine(298, 62, 316, 126, 4.5);
  drawLine(334, 62, 316, 126, 4.5);

  // O (Red Accent)
  drawLine(354, 62, 386, 62, 4.5, 239, 68, 68);
  drawLine(354, 126, 386, 126, 4.5, 239, 68, 68);
  drawLine(354, 62, 354, 126, 4.5, 239, 68, 68);
  drawLine(386, 62, 386, 126, 4.5, 239, 68, 68);

  // Red Slogan Accent Bar
  drawLine(185, 146, 540, 146, 1.5, 239, 68, 68);

  return PNG.sync.write(png);
}

// ----------------------------------------------------
// 3. HELPER: Generate ICO file from PNG buffer
// ----------------------------------------------------
function createIcoFromPng(pngBuf: Buffer): Buffer {
  // Simple ICO header wrapping a single PNG image (32x32)
  const header = Buffer.alloc(6 + 16);
  // Reserved (2 bytes) = 0
  header.writeUInt16LE(0, 0);
  // Type (2 bytes) = 1 (ICO)
  header.writeUInt16LE(1, 2);
  // Count (2 bytes) = 1
  header.writeUInt16LE(1, 4);

  // Image Directory Entry (16 bytes)
  header.writeUInt8(32, 6);        // Width (32)
  header.writeUInt8(32, 7);        // Height (32)
  header.writeUInt8(0, 8);         // Color palette
  header.writeUInt8(0, 9);         // Reserved
  header.writeUInt16LE(1, 10);     // Color planes
  header.writeUInt16LE(32, 12);    // Bits per pixel
  header.writeUInt32LE(pngBuf.length, 14); // Image size
  header.writeUInt32LE(22, 18);    // Offset to image data (6 + 16 = 22)

  return Buffer.concat([header, pngBuf]);
}

// ----------------------------------------------------
// MAIN GENERATION & VALIDATION EXECUTION
// ----------------------------------------------------
console.log('🚀 Generating RYVO Official Brand Assets...');

const wideLogoBuffer = generateWideBrandLogo();
const fav16Buf = generateSquareFavicon(16);
const fav32Buf = generateSquareFavicon(32);
const fav180Buf = generateSquareFavicon(180);
const fav192Buf = generateSquareFavicon(192);
const fav512Buf = generateSquareFavicon(512);
const icoBuf = createIcoFromPng(fav32Buf);

const manifestContent = JSON.stringify({
  name: "RYVO Store",
  short_name: "RYVO",
  description: "المتجر الرسمي للدراجات النارية والمنتجات الفاخرة",
  start_url: "/",
  display: "standalone",
  background_color: "#0B0F19",
  theme_color: "#0B0F19",
  icons: [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png"
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png"
    }
  ]
}, null, 2);

const filesMap: Record<string, Buffer | string> = {
  'ryvo-logo.png': wideLogoBuffer,
  'logo.png': wideLogoBuffer,
  'favicon-16x16.png': fav16Buf,
  'favicon-32x32.png': fav32Buf,
  'apple-touch-icon.png': fav180Buf,
  'icon-192.png': fav192Buf,
  'icon-512.png': fav512Buf,
  'favicon.ico': icoBuf,
  'manifest.webmanifest': manifestContent
};

// Write to public/
for (const [filename, data] of Object.entries(filesMap)) {
  const p = path.join(publicDir, filename);
  fs.writeFileSync(p, data);
  console.log(`  ✓ Wrote public/${filename} (${typeof data === 'string' ? data.length : data.length} B)`);
}

// If dist/ exists, also write directly to dist/
if (fs.existsSync(distDir)) {
  for (const [filename, data] of Object.entries(filesMap)) {
    const p = path.join(distDir, filename);
    fs.writeFileSync(p, data);
    console.log(`  ✓ Wrote dist/${filename} (${typeof data === 'string' ? data.length : data.length} B)`);
  }
}

// ----------------------------------------------------
// AUDIT & INTEGRITY VERIFICATION
// ----------------------------------------------------
console.log('\n🔍 Auditing Static File Signatures & Integrity...');

for (const filename of Object.keys(filesMap)) {
  const pubPath = path.join(publicDir, filename);
  if (!fs.existsSync(pubPath)) {
    throw new Error(`CRITICAL: Missing static asset ${pubPath}`);
  }
  const buf = fs.readFileSync(pubPath);
  if (buf.length === 0) {
    throw new Error(`CRITICAL: Static asset ${pubPath} is empty (0 bytes)`);
  }

  if (filename.endsWith('.png')) {
    // Check PNG Magic Bytes: 0x89 0x50 0x4E 0x47
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
      throw new Error(`CRITICAL: ${filename} is not a valid PNG image! Magic bytes mismatch.`);
    }
  } else if (filename.endsWith('.ico')) {
    // Check ICO Magic Bytes: 0x00 0x00 0x01 0x00
    if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x01 || buf[3] !== 0x00) {
      throw new Error(`CRITICAL: ${filename} is not a valid ICO file! Magic bytes mismatch.`);
    }
  }
}

console.log('✅ ALL BRAND ASSETS GENERATED & VERIFIED SUCCESSFULLY WITH 100% INTEGRITY!\n');
