import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const bg = '/data/.openclaw/media/tool-image-generation/ruhiges-heimspiel-background---b0c0fdd7-a0bd-46fc-9ba9-14f7506c3a72.png';
const dfsLogo = 'src/Logo-Freigestellt.png';
const drutexLogo = 'src/drutex-logo-m.png';
const outDir = 'campaigns/ruhiges-heimspiel/final';
mkdirSync(outDir, { recursive: true });

const BLUE = '#003A66';
const ORANGE = '#F47C26';
const WHITE = '#FFFFFF';
const LIGHT = '#F5F5F5';

function logoData(path){ return `data:image/png;base64,${readFileSync(path).toString('base64')}`; }
const dfs = logoData(dfsLogo);
const drutex = logoData(drutexLogo);
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function text(x,y,content,size,weight=800,color=WHITE,anchor='start',family='Helvetica,Arial,sans-serif'){return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(content)}</text>`}
function cta(x,y,w,h,label,size=18){return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${ORANGE}"/><text x="${x+w/2}" y="${y+h*.64}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="800" fill="#fff">${esc(label)}</text></g>`}
function img(href,x,y,w,h,fit='xMidYMid meet'){return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}"/>`}
function overlay(w,h,type){
 const defs=`<defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#003A66" stop-opacity=".95"/><stop offset=".48" stop-color="#003A66" stop-opacity=".76"/><stop offset="1" stop-color="#003A66" stop-opacity=".10"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#003A66" flood-opacity=".22"/></filter></defs>`;
 if(type==='leaderboard') return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${defs}<rect width="${w}" height="${h}" fill="url(#shade)"/>${img(dfs,18,13,142,36)}${text(185,38,'Ruhiges Heimspiel',26,900)}${text(185,62,'Public Viewing draußen. Ruhe drinnen.',14,700,'#EAF6FF','start','Arial,sans-serif')}<rect x="548" y="13" width="160" height="64" rx="6" fill="#fff" opacity=".96" filter="url(#s)"/>${text(568,39,'10 % Extra',23,900,ORANGE)}${text(568,59,'auf Drutex Fenster',12,800,BLUE,'start','Arial,sans-serif')}</svg>`;
 if(type==='skyscraper') return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${defs}<rect width="${w}" height="${h}" fill="rgba(0,58,102,.35)"/><rect x="0" y="0" width="${w}" height="${h}" fill="url(#shade)" opacity=".86"/>${img(dfs,18,22,124,44)}${text(18,150,'Ruhiges',27,900)}${text(18,184,'Heimspiel',27,900)}${text(18,225,'Public Viewing',14,800,'#EAF6FF','start','Arial,sans-serif')}${text(18,245,'draußen.',14,800,'#EAF6FF','start','Arial,sans-serif')}${text(18,265,'Ruhe drinnen.',14,800,'#EAF6FF','start','Arial,sans-serif')}<rect x="14" y="332" width="132" height="112" rx="8" fill="#fff" opacity=".96" filter="url(#s)"/>${text(28,375,'10 %',34,900,ORANGE)}${text(28,405,'Extra-Rabatt',17,900,BLUE,'start','Arial,sans-serif')}${img(drutex,28,457,104,32)}${cta(14,522,132,42,'Jetzt anfragen',14)}</svg>`;
 return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${defs}<rect width="${w}" height="${h}" fill="url(#shade)"/>${img(dfs,18,18,132,42)}${text(20,96,'Ruhiges',30,900)}${text(20,130,'Heimspiel',30,900)}${text(20,158,'Public Viewing draußen.',14,800,'#EAF6FF','start','Arial,sans-serif')}${text(20,178,'Ruhe drinnen.',14,800,'#EAF6FF','start','Arial,sans-serif')}<rect x="20" y="194" width="138" height="38" rx="4" fill="#fff" opacity=".96"/>${text(32,220,'10 % Extra',22,900,ORANGE)}${img(drutex,178,198,88,24)}${cta(178,28,96,34,'Anfragen',14)}</svg>`;
}
async function make({w,h,type,file,position='center'}){
 const bgBuf = await sharp(bg).resize(w,h,{fit:'cover',position}).png().toBuffer();
 const svg = Buffer.from(overlay(w,h,type));
 await sharp(bgBuf).composite([{input:svg,left:0,top:0}]).png().toFile(join(outDir,file));
}
await make({w:300,h:250,type:'medium',file:'ruhiges-heimspiel-300x250.png',position:'center'});
await make({w:728,h:90,type:'leaderboard',file:'ruhiges-heimspiel-728x90.png',position:'center'});
await make({w:160,h:600,type:'skyscraper',file:'ruhiges-heimspiel-160x600.png',position:'center'});
console.log('done',outDir);
