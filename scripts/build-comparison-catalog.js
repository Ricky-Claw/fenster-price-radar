import fs from 'node:fs';

const profiles = [
  // Neo AD/MD are intentionally excluded until Fensterblick live API can select them without falling back to Salamander greenEvolution.
  ['Aluplast','Ideal 4000'],
  ['Aluplast','Ideal 5000'],
  ['Aluplast','Ideal 7000'],
  ['Aluplast','Ideal 8000']
];
const sizes = ['600x600','800x1000','1000x1200','950x1450','1200x1400'];
const glazings = ['2fach','3fach'];
const configs=[];
for (const [brand,profile] of profiles) for (const size of sizes) for (const glazing of glazings) configs.push({brand,profile:`${profile}, ${glazing}`,material:'PVC',size,glazing,color:'weiß',opening:'Dreh-Kipp',sourceSheet:'generated-clean-v1'});
fs.writeFileSync('data/comparison-catalog.json', JSON.stringify({generatedAt:new Date().toISOString(),scope:'Clean V1 comparable candidates: Aluplast profiles offered by all three providers, safe single-sash sizes',configs},null,2));
console.log(`wrote ${configs.length} configs`);
