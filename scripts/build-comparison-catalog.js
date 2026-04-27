import fs from 'node:fs';

// V2: small fixed benchmark sizes across all safely mappable standard PVC profiles.
// No custom/large single-sash edge cases here; detailed checks belong in the live configurator.
const profiles = [
  ['Drutex','Iglo 5 Classic'],
  ['Drutex','Iglo Energy Classic'],
  ['Aluplast','Ideal 4000'],
  ['Aluplast','Ideal 5000'],
  ['Aluplast','Ideal 7000'],
  ['Aluplast','Ideal 8000'],
  ['Gealan','Gealan S8000'],
  ['Gealan','Gealan S9000'],
  ['Salamander','Salamander 76MD'],
  ['Salamander','Salamander 82'],
  ['Veka','Veka 82 MD'],
  ['Kömmerling','Kömmerling 70'],
  ['Kömmerling','Kömmerling 88']
];
const sizes = ['1000x1500','1300x1500'];
const glazings = ['2fach','3fach'];
const configs=[];
for (const [brand,profile] of profiles) {
  for (const size of sizes) {
    for (const glazing of glazings) {
      configs.push({brand,profile:`${profile}, ${glazing}`,material:'PVC',size,glazing,color:'weiß',opening:'Dreh-Kipp',sourceSheet:'generated-v2-profile-radar'});
    }
  }
}
fs.writeFileSync('data/comparison-catalog.json', JSON.stringify({generatedAt:new Date().toISOString(),scope:'V2 fixed-size profile radar: 1000x1500 and 1300x1500, 2fach/3fach, DK, white, standard PVC profiles',configs},null,2));
console.log(`wrote ${configs.length} configs`);
