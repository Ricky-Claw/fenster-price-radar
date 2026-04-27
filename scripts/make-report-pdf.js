import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('file://' + path.resolve('public/reports/mapping-audit.html'), { waitUntil: 'networkidle' });
await page.pdf({ path: 'public/reports/fensterradar-mapping-audit.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' } });
await browser.close();
console.log('public/reports/fensterradar-mapping-audit.pdf');
