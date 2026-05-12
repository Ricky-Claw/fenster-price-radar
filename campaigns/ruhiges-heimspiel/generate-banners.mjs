import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const out = new URL('./exports/', import.meta.url);
mkdirSync(out, { recursive: true });

const BLUE = '#003A66';
const BLUE2 = '#0B5D91';
const ORANGE = '#F47C26';
const ORANGE_HOVER = '#D86818';
const SKY = '#3FA9F5';
const LIGHT = '#F5F5F5';
const BODY = '#333333';
const drutexData = `data:image/png;base64,${readFileSync(new URL('../../src/drutex-logo-m.png', import.meta.url)).toString('base64')}`;
const dfsLogoData = `data:image/png;base64,${readFileSync(new URL('../../src/Logo-Freigestellt.png', import.meta.url)).toString('base64')}`;

function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function football(cx, cy, r){return `<g transform="translate(${cx} ${cy})"><circle r="${r}" fill="#fff" stroke="${BLUE}" stroke-width="${Math.max(1,r*.07)}"/><polygon points="0,${-r*.42} ${r*.35},${-r*.12} ${r*.22},${r*.32} ${-r*.22},${r*.32} ${-r*.35},${-r*.12}" fill="${BLUE}" opacity=".92"/><path d="M${-r*.35} ${-r*.12} L${-r*.78} ${-r*.25} M${r*.35} ${-r*.12} L${r*.78} ${-r*.25} M${-r*.22} ${r*.32} L${-r*.38} ${r*.75} M${r*.22} ${r*.32} L${r*.38} ${r*.75}" stroke="${BLUE}" stroke-width="${Math.max(1,r*.06)}" stroke-linecap="round"/></g>`}
function floodlights(w,h){return `<g opacity=".22"><path d="M${w*.1} 0 L${w*.36} ${h} M${w*.9} 0 L${w*.64} ${h}" stroke="#fff" stroke-width="${Math.max(16,w*.03)}"/><circle cx="${w*.15}" cy="${h*.12}" r="${Math.max(22,w*.035)}" fill="#fff"/><circle cx="${w*.85}" cy="${h*.12}" r="${Math.max(22,w*.035)}" fill="#fff"/></g>`}
function logo(x,y,w){return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${w*.22}" rx="4" fill="#fff" opacity=".96"/><image href="${dfsLogoData}" x="${w*.04}" y="${w*.035}" width="${w*.88}" height="${w*.16}" preserveAspectRatio="xMidYMid meet"/></g>`}
function drutex(x,y,w){return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${w*.28}" rx="4" fill="#050505" opacity=".96"/><image href="${drutexData}" x="${w*.06}" y="${w*.045}" width="${w*.88}" height="${w*.19}" preserveAspectRatio="xMidYMid meet"/></g>`}
function cta(x,y,text,fs=18,pad=14){const tw=text.length*fs*.52+pad*2; return `<g transform="translate(${x} ${y})"><rect width="${tw}" height="${fs+pad*1.25}" rx="4" fill="${ORANGE}"/><text x="${pad}" y="${fs+pad*.72}" font-family="Arial, sans-serif" font-size="${fs}" font-weight="800" fill="#fff">${esc(text)}</text></g>`}

function layout({w,h,name,variant}){
  const isWide=w/h>3, isTall=h/w>2, isSocial=w>=900&&h>=900;
  const base=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${BLUE}"/><stop offset=".72" stop-color="${BLUE2}"/><stop offset="1" stop-color="${SKY}"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#003A66" flood-opacity=".22"/></filter></defs>`;
  let body='';
  if(isWide){
    body+=`<rect width="${w}" height="${h}" fill="url(#bg)"/>${floodlights(w,h)}<rect x="${w*.02}" y="${h*.14}" width="${w*.22}" height="${h*.72}" rx="8" fill="#fff" opacity=".96"/>${logo(w*.035,h*.28,w*.17)}${drutex(w*.055,h*.55,w*.13)}${football(w*.3,h*.54,h*.22)}<text x="${w*.36}" y="${h*.38}" font-family="Helvetica,Arial,sans-serif" font-size="${h*.28}" font-weight="800" fill="#fff">Ruhiges Heimspiel</text><text x="${w*.36}" y="${h*.63}" font-family="Arial,sans-serif" font-size="${h*.15}" font-weight="700" fill="#EAF6FF">Public Viewing draußen. Ruhe drinnen.</text><rect x="${w*.74}" y="${h*.18}" width="${w*.21}" height="${h*.58}" rx="4" fill="#fff" opacity=".96"/><text x="${w*.765}" y="${h*.43}" font-family="Helvetica,Arial,sans-serif" font-size="${h*.21}" font-weight="900" fill="${ORANGE}">10 % Extra</text><text x="${w*.768}" y="${h*.61}" font-family="Arial,sans-serif" font-size="${h*.105}" font-weight="800" fill="${BLUE}">Drutex Fenster</text>`;
  } else if(isTall){
    body+=`<rect width="${w}" height="${h}" fill="${LIGHT}"/><rect x="0" y="0" width="${w}" height="${h*.38}" fill="url(#bg)"/>${floodlights(w,h*.38)}${logo(w*.12,h*.05,w*.76)}${football(w*.5,h*.28,w*.18)}<text x="${w*.1}" y="${h*.48}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.16}" font-weight="800" fill="${BLUE}">Ruhiges</text><text x="${w*.1}" y="${h*.56}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.16}" font-weight="800" fill="${BLUE}">Heimspiel</text><text x="${w*.1}" y="${h*.63}" font-family="Arial,sans-serif" font-size="${w*.066}" font-weight="700" fill="${BODY}">Public Viewing draußen.</text><text x="${w*.1}" y="${h*.675}" font-family="Arial,sans-serif" font-size="${w*.066}" font-weight="700" fill="${BODY}">Ruhe drinnen.</text><rect x="${w*.1}" y="${h*.715}" width="${w*.8}" height="${h*.105}" rx="8" fill="#fff" filter="url(#shadow)"/><text x="${w*.16}" y="${h*.775}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.115}" font-weight="900" fill="${ORANGE}">10 % Extra</text><text x="${w*.16}" y="${h*.805}" font-family="Arial,sans-serif" font-size="${w*.05}" font-weight="800" fill="${BLUE}">Drutex Fenster</text>${drutex(w*.13,h*.842,w*.62)}${cta(w*.1,h*.925,'Rabatt sichern',w*.068,10)}`;
  } else if(isSocial){
    body+=`<rect width="${w}" height="${h}" fill="${LIGHT}"/><rect x="0" y="0" width="${w}" height="${h*.55}" fill="url(#bg)"/>${floodlights(w,h*.55)}${logo(w*.06,h*.055,w*.38)}${drutex(w*.62,h*.055,w*.28)}${football(w*.78,h*.37,w*.105)}<rect x="${w*.07}" y="${h*.18}" width="${w*.5}" height="${h*.23}" rx="16" fill="#fff" opacity=".96"/><text x="${w*.1}" y="${h*.265}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.068}" font-weight="800" fill="${BLUE}">Ruhiges</text><text x="${w*.1}" y="${h*.345}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.068}" font-weight="800" fill="${BLUE}">Heimspiel</text><text x="${w*.07}" y="${h*.64}" font-family="Arial,sans-serif" font-size="${w*.043}" font-weight="700" fill="${BODY}">Public Viewing draußen. Ruhe drinnen.</text><text x="${w*.07}" y="${h*.74}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.072}" font-weight="900" fill="${ORANGE}">10 % Extra-Rabatt</text><text x="${w*.07}" y="${h*.81}" font-family="Arial,sans-serif" font-size="${w*.04}" font-weight="800" fill="${BLUE}">auf ausgewählte Drutex Fenster</text><text x="${w*.07}" y="${h*.85}" font-family="Arial,sans-serif" font-size="${w*.032}" font-weight="700" fill="${BODY}">Mehr Ruhe · Mehr Komfort · Früh planen</text>${cta(w*.07,h*.895,'Jetzt anfragen',w*.04,18)}`;
  } else {
    body+=`<rect width="${w}" height="${h}" fill="url(#bg)"/>${floodlights(w,h)}${logo(w*.07,h*.07,w*.46)}${football(w*.78,h*.25,w*.11)}<text x="${w*.07}" y="${h*.38}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.105}" font-weight="800" fill="#fff">Ruhiges</text><text x="${w*.07}" y="${h*.51}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.105}" font-weight="800" fill="#fff">Heimspiel</text><text x="${w*.07}" y="${h*.63}" font-family="Arial,sans-serif" font-size="${w*.048}" font-weight="700" fill="#EAF6FF">Public Viewing draußen. Ruhe drinnen.</text><rect x="${w*.07}" y="${h*.7}" width="${w*.48}" height="${h*.16}" rx="6" fill="#fff"/><text x="${w*.1}" y="${h*.795}" font-family="Helvetica,Arial,sans-serif" font-size="${w*.07}" font-weight="900" fill="${ORANGE}">10 % Extra</text>${drutex(w*.58,h*.72,w*.34)}${cta(w*.07,h*.89,'Jetzt anfragen',w*.045,9)}`;
  }
  return base+body+'</svg>';
}

const specs=[
  [300,250,'ruhiges-heimspiel-300x250.svg'],[728,90,'ruhiges-heimspiel-728x90.svg'],[160,600,'ruhiges-heimspiel-160x600.svg'],[1080,1350,'ruhiges-heimspiel-social-4x5.svg'],[1080,1920,'ruhiges-heimspiel-story-9x16.svg']
];
for(const [w,h,file] of specs){writeFileSync(join(out.pathname,file),layout({w,h,name:file})); console.log(file,w,h)}
