/**
 * seed_rankings_real_sources.js
 * Seeds post-2026-draft dynasty rookie rankings from REAL fantasy sources.
 * Sources:
 *   SF:   FantasyCalc SF, DynastyNerds SF, TylerFFCreator SF
 *   1QB:  FantasyCalc, DynastyNerds, KeepTradeCut
 *
 * Replaces the fake/noise-adjusted data from seed_rankings_postdraft_2026.js
 * Date: 2026-04-30
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'dynasty_scout.db'));

const TODAY = '2026-04-30';

// ── Name → Slug override map (edge cases) ─────────────────────────────────
const NAME_OVERRIDES = {
  'kevin coleman':        'kevin-coleman-jr',
  'omar cooper jr.':      'omar-cooper',
  'omar cooper':          'omar-cooper',
  'mike washington jr.':  'mike-washington',
  'mike washington':      'mike-washington',
  'chris brazzell ii':    'chris-brazzell',
  "de'zhaun stribling":   'dezhaun-stribling',
  "ja'kobi lane":         'jakobi-lane',
  "j'mari taylor":        'jmari-taylor',
  "le'veon moss":         'leveon-moss',
  "dae'quan wright":      'daequan-wright',
  'robert henry jr.':     'robert-henry-jr',
  'harrison wallace iii': 'harrison-wallace-iii',
  'jam miller':           'jam-miller',
  'jamarion miller':      'jamarion-miller',
};

function nameToSlug(name) {
  const lower = name.toLowerCase().trim();
  if (NAME_OVERRIDES[lower]) return NAME_OVERRIDES[lower];
  return lower
    .replace(/[''`]/g, '')
    .replace(/\s+jr\.?\s*$/i, '-jr')
    .replace(/\s+iii\s*$/i, '-iii')
    .replace(/\s+ii\s*$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ── KeepTradeCut (scraped 2026-04-30) ─────────────────────────────────────
// SF-style (dynasty values inherently include QB premium)
// Actual rank numbers as shown on KTC rookie rankings page
const KTC = [
  ['Jeremiyah Love',      1],  ['Carnell Tate',        2],
  ['Fernando Mendoza',    3],  ['Jordyn Tyson',        4],
  ['Makai Lemon',         5],  ['Jadarian Price',      6],
  ['KC Concepcion',       7],  ['Kenyon Sadiq',        8],
  ['Omar Cooper Jr.',     9],  ['Ty Simpson',         10],
  ['Eli Stowers',        11],  ['Denzel Boston',      12],
  ['Jonah Coleman',      13],  ['Chris Bell',         14],
  ['Nicholas Singleton', 15],  ['Germie Bernard',     16],
  ['Elijah Sarratt',     17],  ['Chris Brazzell II',  18],
  ['Mike Washington Jr.',19],  ['Malachi Fields',     20],
  ['Zachariah Branch',   21],  ['Antonio Williams',   22],
  ['Emmett Johnson',     23],  ['Skyler Bell',        24],
  ["Ja'Kobi Lane",       25],  ['Kaytron Allen',      26],
  ['Max Klare',          27],  ['Ted Hurst',          28],
  ['Garrett Nussmeier',  29],  ['Cade Klubnik',       30],
  ['Kevin Coleman',      31],  ["De'Zhaun Stribling", 32],
  ['Demond Claiborne',   33],  ['Michael Trigg',      34],
  ['Drew Allar',         35],  ['Carson Beck',        36],
  ["Le'Veon Moss",       37],  ['Deion Burks',        38],
  ['Bryce Lance',        39],  ['Jam Miller',         40],
  ['Kaelon Black',       41],  ['Oscar Delp',         42],
  ["J'Mari Taylor",      43],  ['Seth McGowan',       44],
  ['CJ Daniels',         45],  ['Zavion Thomas',      51],
  ['Justin Joly',        52],  ['Brenen Thompson',    53],
  ['Eli Raridon',        54],  ['Caleb Douglas',      55],
  ['Eli Heidenreich',    56],  ['Sam Roush',          57],
  ['Adam Randall',       58],  ['Nate Boerkircher',   59],
  ['Cole Payton',        61],
];

// ── FantasyCalc SF (scraped 2026-04-30, superflex toggle ON) ──────────────
const FC_SF = [
  ['Jeremiyah Love',      1], ['Fernando Mendoza',    2],
  ['Carnell Tate',        3], ['Jordyn Tyson',        4],
  ['Makai Lemon',         5], ['Jadarian Price',      6],
  ['Kenyon Sadiq',        7], ['KC Concepcion',       8],
  ['Ty Simpson',          9], ['Omar Cooper',        10],
  ['Eli Stowers',        11], ['Denzel Boston',      12],
  ['Jonah Coleman',      13], ['Chris Bell',         14],
  ['Nicholas Singleton', 15], ['Germie Bernard',     16],
  ['Antonio Williams',   17], ['Carson Beck',        18],
  ["De'Zhaun Stribling", 19], ['Zachariah Branch',   20],
  ['Malachi Fields',     21], ['Chris Brazzell',     22],
  ['Kaytron Allen',      23], ['Elijah Sarratt',     24],
  ['Emmett Johnson',     25], ['Mike Washington',    26],
  ['Skyler Bell',        27], ['Max Klare',          28],
  ['Ted Hurst',          29], ["Ja'Kobi Lane",       30],
  ['Drew Allar',         31], ['Demond Claiborne',   32],
  ['Cade Klubnik',       33], ['Oscar Delp',         34],
  ['Kaelon Black',       35], ['Adam Randall',       36],
  ['Eli Raridon',        37], ['Garrett Nussmeier',  38],
  ['Justin Joly',        39], ['Brenen Thompson',    40],
  ['Kevin Coleman',      41], ['Eli Heidenreich',    42],
  ['Bryce Lance',        43], ['Taylen Green',       44],
  ['Caleb Douglas',      45], ['Michael Trigg',      46],
  ["Le'Veon Moss",       47], ['Deion Burks',        48],
  ['Zavion Thomas',      49], ["J'Mari Taylor",      50],
];

// ── FantasyCalc 1QB (scraped 2026-04-30, superflex toggle OFF) ─────────────
const FC_1QB = [
  ['Jeremiyah Love',      1], ['Carnell Tate',        2],
  ['Jordyn Tyson',        3], ['Makai Lemon',         4],
  ['Jadarian Price',      5], ['KC Concepcion',       6],
  ['Kenyon Sadiq',        7], ['Omar Cooper',         8],
  ['Denzel Boston',       9], ['Fernando Mendoza',   10],
  ['Eli Stowers',        11], ['Jonah Coleman',      12],
  ['Nicholas Singleton', 13], ['Chris Bell',         14],
  ['Germie Bernard',     15], ['Antonio Williams',   16],
  ['Kaytron Allen',      17], ['Emmett Johnson',     18],
  ["De'Zhaun Stribling", 19], ['Mike Washington',    20],
  ['Zachariah Branch',   21], ['Malachi Fields',     22],
  ['Chris Brazzell',     23], ['Elijah Sarratt',     24],
  ['Skyler Bell',        25], ['Ty Simpson',         26],
  ['Ted Hurst',          27], ["Ja'Kobi Lane",       28],
  ['Max Klare',          29], ['Demond Claiborne',   30],
  ['Kaelon Black',       31], ['Adam Randall',       32],
  ['Oscar Delp',         33], ['Carson Beck',        34],
  ['Eli Raridon',        35], ['Brenen Thompson',    36],
  ['Eli Heidenreich',    37], ['Kevin Coleman',      38],
  ['Justin Joly',        39], ['Bryce Lance',        40],
  ['Caleb Douglas',      41], ['Drew Allar',         42],
  ['Michael Trigg',      43], ["Le'Veon Moss",       44],
  ['Cade Klubnik',       45], ["J'Mari Taylor",      46],
  ['Deion Burks',        47], ['Zavion Thomas',      48],
  ['Garrett Nussmeier',  49], ['CJ Daniels',         50],
];

// ── DynastyNerds SF (scraped 2026-04-30, from DR_DATA.SFLEX) ──────────────
const DN_SF = [
  ['Jeremiyah Love',      1], ['Carnell Tate',        2],
  ['Fernando Mendoza',    3], ['Makai Lemon',         4],
  ['Jordyn Tyson',        5], ['KC Concepcion',       6],
  ['Jadarian Price',      7], ['Kenyon Sadiq',        8],
  ['Omar Cooper',         9], ['Ty Simpson',         10],
  ['Eli Stowers',        11], ['Denzel Boston',      12],
  ["De'Zhaun Stribling", 13], ['Jonah Coleman',      14],
  ['Germie Bernard',     15], ['Chris Bell',         16],
  ['Ted Hurst',          17], ['Eli Raridon',        18],
  ['Chris Brazzell',     19], ['Justin Joly',        20],
  ['Max Klare',          21], ['Michael Trigg',      22],
  ['Kevin Coleman',      23], ['Malachi Fields',     24],
  ['Mike Washington',    25], ["Dae'Quan Wright",    26],
  ['Kaelon Black',       27], ['Tyren Montgomery',   28],
  ['Tanner Koziol',      29], ['Brenen Thompson',    30],
  ['Emmett Johnson',     31], ['Elijah Sarratt',     32],
  ['Bryce Lance',        33], ['Adam Randall',       34],
  ['Seth McGowan',       35], ["Ja'Kobi Lane",       36],
  ['Zachariah Branch',   37], ['Jack Endries',       38],
  ['Skyler Bell',        39], ['Demond Claiborne',   40],
  ["Le'Veon Moss",       41], ['Sam Roush',          42],
  ['Taylen Green',       43], ['Caleb Douglas',      44],
  ['Robert Henry Jr.',   45], ['Jam Miller',         46],
  ['Deion Burks',        47], ['Luke Altmyer',       48],
  ['Cole Payton',        49], ['Dillon Bell',        50],
  ['Aaron Anderson',     51], ['Desmond Reid',       52],
  ['Harrison Wallace III',53],['Josh Cameron',       54],
  ['Lewis Bond',         55], ['Diego Pavia',        56],
  ['Sawyer Robertson',   57], ['Josh Cuevas',        58],
  ["J'Mari Taylor",      59], ['Rahsul Faison',      60],
  ['CJ Daniels',         61], ['Chase Roberts',      62],
  ['Eric McAlister',     63], ['Eric Rivers',        64],
  ['Haynes King',        65], ['Joe Royer',          66],
  ['Jordan Hudson',      67], ['Roman Hemby',        68],
  ['Terion Stewart',     69],
];

// ── DynastyNerds 1QB/PPR (scraped 2026-04-30, from DR_DATA.PPR) ───────────
const DN_1QB = [
  ['Jeremiyah Love',      1], ['Jordyn Tyson',        2],
  ['Carnell Tate',        3], ['Makai Lemon',         4],
  ['Jadarian Price',      5], ['KC Concepcion',       6],
  ['Omar Cooper',         7], ['Kenyon Sadiq',        8],
  ['Fernando Mendoza',    9], ['Denzel Boston',      10],
  ['Eli Stowers',        11], ['Ted Hurst',          12],
  ['Germie Bernard',     13], ["De'Zhaun Stribling", 14],
  ['Jonah Coleman',      15], ['Chris Bell',         16],
  ['Chris Brazzell',     17], ['Malachi Fields',     18],
  ['Ty Simpson',         19], ['Justin Joly',        20],
  ['Max Klare',          21], ['Eli Raridon',        22],
  ['Michael Trigg',      23], ['Mike Washington',    24],
  ['Kevin Coleman',      25], ['Brenen Thompson',    26],
  ["Dae'Quan Wright",    27], ["Ja'Kobi Lane",       28],
  ['Kaelon Black',       29], ['Bryce Lance',        30],
  ['Adam Randall',       31], ['Tyren Montgomery',   32],
  ['Tanner Koziol',      33], ['Seth McGowan',       34],
  ['Emmett Johnson',     35], ['Elijah Sarratt',     36],
  ['Demond Claiborne',   37], ['Skyler Bell',        38],
  ['Zachariah Branch',   39], ['Jack Endries',       40],
  ["Le'Veon Moss",       41], ['Sam Roush',          42],
  ['Caleb Douglas',      43], ['Taylen Green',       44],
  ['Robert Henry Jr.',   45], ['Jam Miller',         46],
  ['Deion Burks',        47], ['Luke Altmyer',       48],
  ['Cole Payton',        49], ['Dillon Bell',        50],
  ['Aaron Anderson',     51], ['Desmond Reid',       52],
  ['Harrison Wallace III',53],['Josh Cameron',       54],
  ['Lewis Bond',         55], ['Diego Pavia',        56],
  ['Sawyer Robertson',   57], ['Josh Cuevas',        58],
  ["J'Mari Taylor",      59], ['Rahsul Faison',      60],
  ['CJ Daniels',         61], ['Chase Roberts',      62],
  ['Eric McAlister',     63], ['Eric Rivers',        64],
  ['Joe Royer',          65], ['Jordan Hudson',      66],
  ['Roman Hemby',        67], ['Terion Stewart',     68],
  ['Haynes King',        69],
];

// ── TylerFFCreator SF (user-provided 2026-04-30) ──────────────────────────
const TYLER_SF = [
  ['Jeremiyah Love',      1], ['Fernando Mendoza',    2],
  ['Carnell Tate',        3], ['Jordyn Tyson',        4],
  ['Makai Lemon',         5], ['KC Concepcion',       6],
  ['Jadarian Price',      7], ['Ty Simpson',          8],
  ['Omar Cooper',         9], ['Kenyon Sadiq',       10],
  ['Denzel Boston',      11], ['Germie Bernard',     12],
  ['Eli Stowers',        13], ["De'Zhaun Stribling", 14],
  ['Jonah Coleman',      15], ['Antonio Williams',   16],
  ['Chris Brazzell',     17], ['Zachariah Branch',   18],
  ['Malachi Fields',     19], ['Nicholas Singleton', 20],
  ['Chris Bell',         21], ['Emmett Johnson',     22],
  ['Mike Washington',    23], ['Ted Hurst',          24],
  ['Adam Randall',       25], ['Kaelon Black',       26],
  ['Max Klare',          27], ['Kaytron Allen',      28],
  ['Carson Beck',        29], ['Demond Claiborne',   30],
  ['Oscar Delp',         31], ['Drew Allar',         32],
  ['Skyler Bell',        33], ["Ja'Kobi Lane",       34],
  ['Caleb Douglas',      35], ['Eli Raridon',        36],
  ['Eli Heidenreich',    37], ['Elijah Sarratt',     38],
  ['Bryce Lance',        39], ['Seth McGowan',       40],
  ['Cade Klubnik',       41], ['Jamarion Miller',    42],
  ['Brenen Thompson',    43], ['Reggie Virgil',      44],
  ['Cyrus Allen',        45], ['Zavion Thomas',      46],
  ['Kevin Coleman',      47], ['Jaydn Ott',          48],
  ["Le'Veon Moss",       49], ["J'Mari Taylor",      50],
  ['Marlin Klein',       51], ['Cole Payton',        52],
  ['Kendrick Law',       53], ['Colbie Young',       54],
  ['Justin Joly',        55], ['Taylen Green',       56],
  ['Garrett Nussmeier',  57],
];

// ── Helpers ───────────────────────────────────────────────────────────────
const playerCache = new Map();

function getPlayerId(name) {
  const slug = nameToSlug(name);
  if (playerCache.has(slug)) return playerCache.get(slug);
  const row = db.prepare('SELECT id FROM players WHERE slug = ? AND draft_year = 2026').get(slug);
  const id = row ? row.id : null;
  playerCache.set(slug, id);
  return id;
}

function insertRankings(source, rankList) {
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO rankings (player_id, source, rank_overall, scraped_at)
    VALUES (?, ?, ?, ?)
  `);
  let inserted = 0, missing = 0;
  for (const [name, rank] of rankList) {
    const pid = getPlayerId(name);
    if (!pid) {
      console.warn(`  ⚠ Not found: "${name}" (slug: ${nameToSlug(name)})`);
      missing++;
      continue;
    }
    upsert.run(pid, source, rank, TODAY);
    inserted++;
  }
  console.log(`  ${source}: ${inserted} inserted, ${missing} not found`);
  return inserted;
}

// ── Consensus ─────────────────────────────────────────────────────────────
function computeConsensus(format) {
  const sfSources  = ['FantasyCalc SF', 'DynastyNerds SF', 'TylerFFCreator SF'];
  const oneSources = ['FantasyCalc', 'DynastyNerds', 'KeepTradeCut'];
  const sources = format === 'SF' ? sfSources : oneSources;

  const playersWithRanks = db.prepare(`
    SELECT DISTINCT p.id, p.slug
    FROM players p
    JOIN rankings r ON p.id = r.player_id
    WHERE p.draft_year = 2026
    AND r.source IN (${sources.map(() => '?').join(',')})
    ORDER BY p.id
  `).all(...sources);

  const insertConsensus = db.prepare(`
    INSERT OR REPLACE INTO consensus_rankings
      (player_id, format, rank_overall, rank_positional, avg_rank, best_rank, worst_rank, std_deviation, num_sources, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const playerData = [];
  for (const { id } of playersWithRanks) {
    const ranks = db.prepare(`
      SELECT rank_overall FROM rankings
      WHERE player_id = ? AND source IN (${sources.map(() => '?').join(',')})
      AND rank_overall IS NOT NULL
      ORDER BY scraped_at DESC
    `).all(id, ...sources).map(r => r.rank_overall);

    if (ranks.length === 0) continue;
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const best = Math.min(...ranks);
    const worst = Math.max(...ranks);
    const variance = ranks.length > 1
      ? ranks.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / ranks.length : 0;
    playerData.push({ id, avg, best, worst, stddev: Math.sqrt(variance), num_sources: ranks.length });
  }

  playerData.sort((a, b) => a.avg - b.avg);

  const txn = db.transaction(() => {
    // Clear old consensus for this format
    db.prepare(`DELETE FROM consensus_rankings WHERE format = ? AND calculated_at < ?`).run(format, TODAY);
    for (let i = 0; i < playerData.length; i++) {
      const { id, avg, best, worst, stddev, num_sources } = playerData[i];
      insertConsensus.run(id, format, i + 1, null, avg, best, worst, stddev, num_sources, TODAY);
    }
  });
  txn();
  console.log(`  ${format} consensus: ${playerData.length} players ranked`);
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log('Removing old fake/mock rankings...');
db.prepare(`DELETE FROM rankings WHERE source IN ('FantasyPros SF','FantasyPros','FantasyCalc SF','FantasyCalc','DynastyNerds SF','DynastyNerds','KeepTradeCut','TylerFFCreator SF') AND scraped_at < ?`).run(TODAY);

console.log('\nInserting real post-draft rankings...');
const batchInsert = db.transaction(() => {
  insertRankings('KeepTradeCut',       KTC);
  insertRankings('FantasyCalc SF',     FC_SF);
  insertRankings('FantasyCalc',        FC_1QB);
  insertRankings('DynastyNerds SF',    DN_SF);
  insertRankings('DynastyNerds',       DN_1QB);
  insertRankings('TylerFFCreator SF',  TYLER_SF);
});
batchInsert();

console.log('\nRecomputing consensus...');
computeConsensus('SF');
computeConsensus('1QB');

// ── Verify ────────────────────────────────────────────────────────────────
console.log('\nTop 10 SF consensus:');
db.prepare(`
  SELECT p.full_name, p.position, p.nfl_team, c.rank_overall, c.avg_rank, c.num_sources
  FROM consensus_rankings c JOIN players p ON c.player_id = p.id
  WHERE c.format = 'SF' AND c.calculated_at = ?
  ORDER BY c.rank_overall LIMIT 10
`).all(TODAY).forEach(p =>
  console.log(`  ${p.rank_overall}. ${p.full_name} (${p.position}) → ${p.nfl_team ?? 'Undrafted'} [avg: ${Number(p.avg_rank).toFixed(1)}, n=${p.num_sources}]`)
);

console.log('\nTop 10 1QB consensus:');
db.prepare(`
  SELECT p.full_name, p.position, p.nfl_team, c.rank_overall, c.avg_rank, c.num_sources
  FROM consensus_rankings c JOIN players p ON c.player_id = p.id
  WHERE c.format = '1QB' AND c.calculated_at = ?
  ORDER BY c.rank_overall LIMIT 10
`).all(TODAY).forEach(p =>
  console.log(`  ${p.rank_overall}. ${p.full_name} (${p.position}) → ${p.nfl_team ?? 'Undrafted'} [avg: ${Number(p.avg_rank).toFixed(1)}, n=${p.num_sources}]`)
);

db.close();
console.log('\nDone!');
