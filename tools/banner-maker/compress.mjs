import sharp from 'sharp';
import { readImageMeta } from './image-meta.mjs';

function assertOutput(buffer, format, width, height) {
  const meta = readImageMeta(buffer);
  if (meta.format !== format || meta.width !== width || meta.height !== height) {
    throw new Error(`Komprimiertes Banner ungültig: ist ${meta.width}x${meta.height} (${meta.format}), soll ${width}x${height} (${format}) sein.`);
  }
}

export async function finalizeBanner({ pngBuffer, width, height, preferPng, maxBytes = 150 * 1024 }) {
  const input = sharp(pngBuffer).resize(width, height, { kernel: 'lanczos3', fit: 'fill' });
  const tried = [];

  if (preferPng) {
    const buffer = await input.clone().png({ palette: true, colors: 128, compressionLevel: 9 }).toBuffer();
    tried.push(`PNG: ${buffer.length} Bytes`);
    if (buffer.length <= maxBytes) {
      assertOutput(buffer, 'png', width, height);
      return { buffer, format: 'png', bytes: buffer.length, quality: null };
    }
  }

  for (const quality of [82, 75, 68, 60, 52, 45]) {
    const buffer = await input.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    tried.push(`JPEG Qualität ${quality}: ${buffer.length} Bytes`);
    if (buffer.length <= maxBytes) {
      assertOutput(buffer, 'jpeg', width, height);
      return { buffer, format: 'jpeg', bytes: buffer.length, quality };
    }
  }
  throw new Error(`Banner überschreitet ${maxBytes} Bytes. ${tried.join('; ')}. Motiv ist zu komplex — ruhigeres/kleineres Motiv wählen.`);
}
