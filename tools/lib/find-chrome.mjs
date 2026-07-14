import { existsSync } from 'node:fs';
import path from 'node:path';

function executableOnPath(name) {
  const paths = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return paths.map((directory) => path.join(directory, name)).find(existsSync) || null;
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  const direct = candidates.find(existsSync);
  if (direct) return path.resolve(direct);

  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
    const executable = executableOnPath(name);
    if (executable) return path.resolve(executable);
  }
  return null;
}
