import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const distDir = path.join(process.cwd(), 'dist');

// Ensure directories exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

/**
 * Creates an ICO container file wrapping 16x16, 32x32, and 48x48 PNG buffers
 */
export function createIcoFromPng(png16: Buffer, png32: Buffer, png48: Buffer): Buffer {
  const count = 3;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4); // Count = 3 images

  const dirEntrySize = 16;
  const dirSize = count * dirEntrySize;
  let currentOffset = 6 + dirSize;

  const entries: Buffer[] = [];

  const images = [
    { buf: png16, w: 16, h: 16 },
    { buf: png32, w: 32, h: 32 },
    { buf: png48, w: 48, h: 48 }
  ];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.w === 256 ? 0 : img.w, 0);
    entry.writeUInt8(img.h === 256 ? 0 : img.h, 1);
    entry.writeUInt8(0, 2); // Palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buf.length, 8); // Image size in bytes
    entry.writeUInt32LE(currentOffset, 12); // Offset
    entries.push(entry);
    currentOffset += img.buf.length;
  }

  return Buffer.concat([header, ...entries, png16, png32, png48]);
}

/**
 * Resizes a PNG object using bilinear interpolation, centering inside a square canvas if requested.
 */
export function resizePngImage(
  srcPng: InstanceType<typeof PNG>,
  dstWidth: number,
  dstHeight: number,
  makeSquarePad = false,
  bgColor = { r: 11, g: 15, b: 25, a: 0 } // Default transparent padding
): InstanceType<typeof PNG> {
  const dstPng = new PNG({ width: dstWidth, height: dstHeight });
  const srcW = srcPng.width;
  const srcH = srcPng.height;

  if (!makeSquarePad) {
    // Direct bilinear scaling
    for (let y = 0; y < dstHeight; y++) {
      for (let x = 0; x < dstWidth; x++) {
        const gx = (x + 0.5) * (srcW / dstWidth) - 0.5;
        const gy = (y + 0.5) * (srcH / dstHeight) - 0.5;

        const gxi = Math.floor(gx);
        const gyi = Math.floor(gy);

        const fx = gx - gxi;
        const fy = gy - gyi;

        const x0 = Math.max(0, Math.min(srcW - 1, gxi));
        const x1 = Math.max(0, Math.min(srcW - 1, gxi + 1));
        const y0 = Math.max(0, Math.min(srcH - 1, gyi));
        const y1 = Math.max(0, Math.min(srcH - 1, gyi + 1));

        const i00 = (y0 * srcW + x0) << 2;
        const i10 = (y0 * srcW + x1) << 2;
        const i01 = (y1 * srcW + x0) << 2;
        const i11 = (y1 * srcW + x1) << 2;

        const dstIdx = (y * dstWidth + x) << 2;

        for (let c = 0; c < 4; c++) {
          const top = srcPng.data[i00 + c] * (1 - fx) + srcPng.data[i10 + c] * fx;
          const bottom = srcPng.data[i01 + c] * (1 - fx) + srcPng.data[i11 + c] * fx;
          const val = top * (1 - fy) + bottom * fy;
          dstPng.data[dstIdx + c] = Math.round(val);
        }
      }
    }
    return dstPng;
  }

  // Centered square padding
  const aspect = srcW / srcH;
  let targetW = dstWidth;
  let targetH = dstHeight;

  if (aspect > 1) {
    targetH = Math.round(dstWidth / aspect);
  } else {
    targetW = Math.round(dstHeight * aspect);
  }

  const offsetX = Math.floor((dstWidth - targetW) / 2);
  const offsetY = Math.floor((dstHeight - targetH) / 2);

  // Fill background
  for (let i = 0; i < dstWidth * dstHeight * 4; i += 4) {
    dstPng.data[i] = bgColor.r;
    dstPng.data[i + 1] = bgColor.g;
    dstPng.data[i + 2] = bgColor.b;
    dstPng.data[i + 3] = bgColor.a;
  }

  // Rescale source into target dimension and blit onto canvas
  const scaledContent = resizePngImage(srcPng, targetW, targetH, false);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcIdx = (y * targetW + x) << 2;
      const dstX = offsetX + x;
      const dstY = offsetY + y;

      if (dstX >= 0 && dstX < dstWidth && dstY >= 0 && dstY < dstHeight) {
        const dstIdx = (dstY * dstWidth + dstX) << 2;
        const alpha = scaledContent.data[srcIdx + 3] / 255;

        if (alpha > 0) {
          dstPng.data[dstIdx] = Math.round(scaledContent.data[srcIdx] * alpha + dstPng.data[dstIdx] * (1 - alpha));
          dstPng.data[dstIdx + 1] = Math.round(scaledContent.data[srcIdx + 1] * alpha + dstPng.data[dstIdx + 1] * (1 - alpha));
          dstPng.data[dstIdx + 2] = Math.round(scaledContent.data[srcIdx + 2] * alpha + dstPng.data[dstIdx + 2] * (1 - alpha));
          dstPng.data[dstIdx + 3] = Math.max(dstPng.data[dstIdx + 3], scaledContent.data[srcIdx + 3]);
        }
      }
    }
  }

  return dstPng;
}

/**
 * Generates all Favicon & PWA icons from a master PNG buffer and saves them to /public and /dist
 */
export function generateFaviconsFromPngBuffer(masterPngBuffer: Buffer): {
  fav16: Buffer;
  fav32: Buffer;
  fav48: Buffer;
  fav180: Buffer;
  fav192: Buffer;
  fav512: Buffer;
  ico: Buffer;
} {
  const srcPng = PNG.sync.read(masterPngBuffer);

  const fav16Png = resizePngImage(srcPng, 16, 16, true);
  const fav32Png = resizePngImage(srcPng, 32, 32, true);
  const fav48Png = resizePngImage(srcPng, 48, 48, true);
  const fav180Png = resizePngImage(srcPng, 180, 180, true);
  const fav192Png = resizePngImage(srcPng, 192, 192, true);
  const fav512Png = resizePngImage(srcPng, 512, 512, true);

  const fav16Buf = PNG.sync.write(fav16Png);
  const fav32Buf = PNG.sync.write(fav32Png);
  const fav48Buf = PNG.sync.write(fav48Png);
  const fav180Buf = PNG.sync.write(fav180Png);
  const fav192Buf = PNG.sync.write(fav192Png);
  const fav512Buf = PNG.sync.write(fav512Png);
  const icoBuf = createIcoFromPng(fav16Buf, fav32Buf, fav48Buf);

  const filesMap: Record<string, Buffer> = {
    'favicon-16x16.png': fav16Buf,
    'favicon-32x32.png': fav32Buf,
    'favicon-48x48.png': fav48Buf,
    'apple-touch-icon.png': fav180Buf,
    'apple-touch-icon-precomposed.png': fav180Buf,
    'icon-192.png': fav192Buf,
    'android-chrome-192x192.png': fav192Buf,
    'icon-512.png': fav512Buf,
    'android-chrome-512x512.png': fav512Buf,
    'favicon.ico': icoBuf,
  };

  // Write files to public/
  for (const [filename, buf] of Object.entries(filesMap)) {
    const pubPath = path.join(publicDir, filename);
    fs.writeFileSync(pubPath, buf);
  }

  // Write files to dist/ if present
  if (fs.existsSync(distDir)) {
    for (const [filename, buf] of Object.entries(filesMap)) {
      const distPath = path.join(distDir, filename);
      fs.writeFileSync(distPath, buf);
    }
  }

  return {
    fav16: fav16Buf,
    fav32: fav32Buf,
    fav48: fav48Buf,
    fav180: fav180Buf,
    fav192: fav192Buf,
    fav512: fav512Buf,
    ico: icoBuf,
  };
}

/**
 * Saves master logo image file to public/logo.png & public/ryvo-logo.png and dist/
 */
export function saveMasterLogoFile(pngBuffer: Buffer) {
  const filesMap: Record<string, Buffer> = {
    'logo.png': pngBuffer,
    'ryvo-logo.png': pngBuffer,
  };

  for (const [filename, buf] of Object.entries(filesMap)) {
    const pubPath = path.join(publicDir, filename);
    fs.writeFileSync(pubPath, buf);
    if (fs.existsSync(distDir)) {
      const distPath = path.join(distDir, filename);
      fs.writeFileSync(distPath, buf);
    }
  }
}

/**
 * Process new logo input from Admin Panel (data URL, base64, or URL)
 */
export async function processAndApplyStoreLogo(logoInput: string): Promise<{
  shopLogoUrl: string;
  timestamp: number;
}> {
  const timestamp = Date.now();

  // Case A: Base64 / Data URL
  if (logoInput.startsWith('data:image/') || logoInput.includes(';base64,')) {
    const base64Data = logoInput.replace(/^data:image\/\w+;base64,/, '').trim();
    const buffer = Buffer.from(base64Data, 'base64');

    try {
      // Decode PNG & save
      saveMasterLogoFile(buffer);
      generateFaviconsFromPngBuffer(buffer);
    } catch (err: any) {
      console.warn('⚠️ Could not decode uploaded image as PNG directly:', err.message);
      // Even if raw PNG sync fails, save master buffer
      saveMasterLogoFile(buffer);
    }

    const shopLogoUrl = `/logo.png?v=${timestamp}`;
    return { shopLogoUrl, timestamp };
  }

  // Case B: External / Direct HTTP URL
  if (logoInput.startsWith('http://') || logoInput.startsWith('https://')) {
    try {
      // Fetch image from URL to derive favicons locally
      const res = await fetch(logoInput);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        try {
          saveMasterLogoFile(buffer);
          generateFaviconsFromPngBuffer(buffer);
        } catch (e: any) {
          console.warn('⚠️ Could not parse fetched URL image for favicons:', e.message);
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Error fetching logo from external URL:', err.message);
    }

    const shopLogoUrl = logoInput.includes('?') ? `${logoInput}&v=${timestamp}` : `${logoInput}?v=${timestamp}`;
    return { shopLogoUrl, timestamp };
  }

  // Case C: Relative Path (e.g., /logo.png)
  if (logoInput.startsWith('/')) {
    const shopLogoUrl = logoInput.includes('?v=') ? logoInput : `${logoInput.split('?')[0]}?v=${timestamp}`;
    return { shopLogoUrl, timestamp };
  }

  // Case D: Reset / Delete / Plain Text (e.g. "RYVO")
  // Keep logo.png as official default brand assets
  const shopLogoUrl = `/logo.png?v=${timestamp}`;
  return { shopLogoUrl, timestamp };
}
