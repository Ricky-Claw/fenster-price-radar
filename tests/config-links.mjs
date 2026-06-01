import assert from 'node:assert/strict';
import {
  providerProfileLink,
  rowConfigLink,
} from '../src/configLinks.js';

const row = {
  brand: 'Aluplast',
  profile: 'Ideal 4000, 3fach',
  width: 1400,
  height: 1300,
  glazing: '3fach',
  opening: 'Dreh-Kipp + Dreh-Kipp',
  color: 'weiß',
  layout: '2flg_pfosten',
  providers: {
    dfs: { provider: 'dfs', profileId: 12, valid: true },
    fensterblick: { provider: 'fensterblick', valid: true },
    fensterversand: { provider: 'fensterversand', valid: true },
  },
};

assert.equal(
  rowConfigLink(row),
  'https://deutscher-fenstershop.de/konfigurator/fenster?pid=12&tp=fenster&material=pvc&width=1400&height=1300&glass=3fach&opening=Dreh-Kipp+%2B+Dreh-Kipp&layout=2flg_pfosten'
);

assert.equal(
  providerProfileLink(row, 'fensterblick'),
  'https://www.fensterblick.de/fenster-konfigurator.html?profile=Aluplast+Ideal+4000+Classic-Line&profileId=129'
);

assert.equal(
  providerProfileLink(row, 'fensterversand'),
  'https://www.fensterversand.com/fenster/kunststoff/aluplast-ideal-4000.php'
);

assert.equal(providerProfileLink(row, 'dfs'), rowConfigLink(row));

console.log('config-links ok');
