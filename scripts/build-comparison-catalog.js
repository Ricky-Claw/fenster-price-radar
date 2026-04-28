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
// Four benchmark dimensions per window type/profile:
// - smallest broadly comparable one-sash size
// - two mid-market sizes chosen for common quote relevance
// - larger existing comparison size
const sizes = [
  { size:'800x1000', sizeRole:'kleinste vergleichbare Größe' },
  { size:'1000x1200', sizeRole:'mittlere Größe 1' },
  { size:'1000x1500', sizeRole:'mittlere Größe 2' },
  { size:'1300x1500', sizeRole:'große Vergleichsgröße' }
];
const glazings = ['2fach','3fach'];
const configs=[];
for (const [brand,profile] of profiles) {
  for (const {size,sizeRole} of sizes) {
    for (const glazing of glazings) {
      configs.push({brand,profile:`${profile}, ${glazing}`,material:'PVC',size,sizeRole,glazing,color:'weiß',opening:'Dreh-Kipp',sourceSheet:'generated-v3-4-size-profile-radar'});
    }
  }
}
fs.writeFileSync('data/comparison-catalog.json', JSON.stringify({generatedAt:new Date().toISOString(),scope:'V3 4-size profile radar: 800x1000, 1000x1200, 1000x1500, 1300x1500; 2fach/3fach, DK, white, standard PVC profiles',configs},null,2));
console.log(`wrote ${configs.length} configs`);
