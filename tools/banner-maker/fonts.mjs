import { readFileSync } from 'node:fs';

const FONT_FILES = [
  ['Inter', 400, 'inter-400.woff2'],
  ['Inter', 700, 'inter-700.woff2'],
  ['Montserrat', 800, 'montserrat-800.woff2'],
];

export function loadFontsCss() {
  return FONT_FILES.map(([family, weight, filename]) => {
    const fontUrl = new URL(`assets/fonts/${filename}`, import.meta.url);
    let encoded;

    try {
      encoded = readFileSync(fontUrl).toString('base64');
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Schriftdatei fehlt: ${filename}.`);
      throw error;
    }

    return `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; src: url(data:font/woff2;base64,${encoded}) format('woff2'); font-display: block; }`;
  }).join('\n');
}
