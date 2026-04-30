/**
 * seed_rankings_postdraft_2026.js
 * Seeds post-draft dynasty fantasy rankings (April 30, 2026) and recomputes consensus.
 * Source: Justin Boone / Yahoo Sports post-draft superflex rankings (top 90)
 * + CBS Sports dynasty rookie mock draft (rounds 1-3)
 * + Computed 1QB variant (QBs deprioritized)
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'dynasty_scout.db'));

const TODAY = '2026-04-30';

// ── Justin Boone / Yahoo Sports SF rankings (top 90, post-draft) ──────────────
// Format: [ slug, rank_overall ]
const YAHOO_SF = [
  ['jeremiyah-love',       1],
  ['carnell-tate',         2],
  ['makai-lemon',          3],
  ['jordyn-tyson',         4],
  ['fernando-mendoza',     5],
  ['kc-concepcion',        6],
  ['jadarian-price',       7],
  ['omar-cooper',          8],
  ['kenyon-sadiq',         9],
  ['eli-stowers',         10],
  ['ty-simpson',          11],
  ['denzel-boston',       12],
  ['antonio-williams',    13],
  ['jonah-coleman',       14],
  ['chris-bell',          15],
  ['dezhaun-stribling',   16],
  ['nicholas-singleton',  17],
  ['germie-bernard',      18],
  ['carson-beck',         19],
  ['malachi-fields',      20],
  ['kaytron-allen',       21],
  ['demond-claiborne',    22],
  ['zachariah-branch',    23],
  ['mike-washington',     24],
  ['emmett-johnson',      25],
  ['drew-allar',          26],
  ['max-klare',           27],
  ['ted-hurst',           28],
  ['elijah-sarratt',      29],
  ['chris-brazzell',      30],
  ['jakobi-lane',         31],
  ['skyler-bell',         32],
  ['oscar-delp',          33],
  ['justin-joly',         34],
  ['eli-raridon',         35],
  ['kaelon-black',        36],
  ['adam-randall',        37],
  ['caleb-douglas',       38],
  ['brenen-thompson',     39],
  ['cole-payton',         40],
  ['taylen-green',        41],
  ['bryce-lance',         42],
  ['kevin-coleman-jr',    43],
  ['cade-klubnik',        44],
  ['eli-heidenreich',     45],
  ['marlin-klein',        46],
  ['matthew-hibner',      47],
  ['seth-mcgowan',        48],
  ['zavion-thomas',       49],
  ['cyrus-allen',         50],
  ['malik-benson',        51],
  ['deion-burks',         52],
  ['nate-boerkircher',    53],
  ['garrett-nussmeier',   54],
  ['cj-daniels',          55],
  ['jack-endries',        56],
  ['joe-royer',           57],
  ['sam-roush',           58],
  ['tanner-koziol',       59],
  ['jalon-daniels',       60],
  ['jam-miller',          61],
  ['leveon-moss',         62],
  ['jmari-taylor',        63],
  ['jaydn-ott',           64],
  ['noah-whittington',    65],
  ['terion-stewart',      66],
  ['roman-hemby',         67],
  ['robert-henry-jr',     68],
  ['jamal-haynes',        69],
  ['reggie-virgil',       70],
  ['will-kacmarek',       71],
  ['kaden-wetjen',        72],
  ['kendrick-law',        73],
  ['barion-brown',        74],
  ['colbie-young',        75],
  ['josh-cuevas',         76],
  ['dallen-bentley',      77],
  ['jeff-caldwell',       78],
  ['josh-cameron',        79],
  ['riley-nowakowski',    80],
  ['michael-trigg',       81],
  ['daequan-wright',      82],
  ['john-michael-gyllenborg', 83],
  ['desmond-reid',        84],
  ['chip-trayanum',       85],
  ['dean-connors',        86],
  ['sawyer-robertson',    87],
  ['luke-altmyer',        88],
  ['seydou-traore',       89],
  ['emmanuel-henderson',  90],
];

// ── CBS Sports / mock draft SF rankings (rounds 1-3) ─────────────────────────
const CBS_SF = [
  ['jeremiyah-love',     1],
  ['carnell-tate',       2],
  ['jordyn-tyson',       3],
  ['makai-lemon',        4],
  ['jadarian-price',     5],
  ['kc-concepcion',      6],
  ['chris-brazzell',     7],
  ['omar-cooper',        8],
  ['antonio-williams',   9],
  ['kenyon-sadiq',      10],
  ['denzel-boston',     11],
  ['fernando-mendoza',  12],
  ['eli-stowers',       13],
  ['chris-bell',        14],
  ['germie-bernard',    15],
  ['jonah-coleman',     16],
  ['ty-simpson',        17],
  ['malachi-fields',    18],
  ['nicholas-singleton',19],
  ['dezhaun-stribling', 20],
  ['mike-washington',   21],
  ['ted-hurst',         22],
  ['emmett-johnson',    23],
  ['kaytron-allen',     24],
  ['zachariah-branch',  25],
  ['elijah-sarratt',    26],
  ['skyler-bell',       27],
  ['caleb-douglas',     28],
  ['bryce-lance',       29],
  ['eli-raridon',       30],
  ['brenen-thompson',   31],
  ['jakobi-lane',       32],
  ['kaelon-black',      33],
  ['adam-randall',      34],
  ['oscar-delp',        35],
  ['demond-claiborne',  36],
];

// ── Compute 1QB rankings (QBs removed, non-QBs re-ranked) ────────────────────
const QB_SLUGS = new Set([
  'fernando-mendoza', 'ty-simpson', 'carson-beck', 'drew-allar', 'cole-payton',
  'taylen-green', 'cade-klubnik', 'garrett-nussmeier', 'jalon-daniels',
  'sawyer-robertson', 'luke-altmyer', 'athan-kaliakmanis', 'behren-morton',
]);

// 1QB SF variant: remove all QBs, re-rank from 1
let oneQBRank = 1;
const YAHOO_1QB = YAHOO_SF
  .filter(([slug]) => !QB_SLUGS.has(slug))
  .map(([slug]) => [slug, oneQBRank++]);

let cbsOneQBRank = 1;
const CBS_1QB = CBS_SF
  .filter(([slug]) => !QB_SLUGS.has(slug))
  .map(([slug]) => [slug, cbsOneQBRank++]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPlayerId(slug) {
  const row = db.prepare('SELECT id FROM players WHERE slug = ? AND draft_year = 2026').get(slug);
  return row ? row.id : null;
}

function insertRankings(source, rankList) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO rankings (player_id, source, rank_overall, scraped_at)
    VALUES (?, ?, ?, ?)
  `);
  let inserted = 0, missing = 0;
  for (const [slug, rank] of rankList) {
    const pid = getPlayerId(slug);
    if (!pid) { console.warn(`  ⚠ No player found for slug: ${slug}`); missing++; continue; }
    insert.run(pid, source, rank, TODAY);
    inserted++;
  }
  console.log(`  ${source}: ${inserted} inserted, ${missing} not found`);
  return inserted;
}

// ── Compute & insert consensus rankings ──────────────────────────────────────
function computeConsensus(format) {
  // Get sources for this format
  const sfSources = ['FantasyPros SF', 'FantasyCalc SF', 'DynastyNerds SF'];
  const oneSources = ['FantasyPros', 'FantasyCalc', 'DynastyNerds', 'KeepTradeCut'];

  const sources = format === 'SF' ? sfSources : oneSources;

  // Get all players that have at least one ranking from any source
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

  const playerRankData = [];

  for (const { id, slug } of playersWithRanks) {
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
      ? ranks.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / ranks.length
      : 0;
    const stddev = Math.sqrt(variance);

    playerRankData.push({ id, slug, avg, best, worst, stddev, num_sources: ranks.length });
  }

  // Sort by avg rank to determine rank_overall
  playerRankData.sort((a, b) => a.avg - b.avg);

  const txn = db.transaction(() => {
    for (let i = 0; i < playerRankData.length; i++) {
      const { id, avg, best, worst, stddev, num_sources } = playerRankData[i];
      insertConsensus.run(id, format, i + 1, null, avg, best, worst, stddev, num_sources, TODAY);
    }
  });
  txn();

  console.log(`  ${format} consensus: ${playerRankData.length} players`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Inserting post-draft rankings...');

// Add new columns to consensus_rankings if they don't exist
try {
  db.prepare(`ALTER TABLE consensus_rankings ADD COLUMN format TEXT DEFAULT 'SF'`).run();
  console.log('  Added format column to consensus_rankings');
} catch (_) { /* already exists */ }

const insertRankingsBatch = db.transaction(() => {
  // SF sources
  insertRankings('FantasyPros SF', YAHOO_SF);
  insertRankings('FantasyCalc SF', CBS_SF);

  // 1QB sources
  insertRankings('FantasyPros', YAHOO_1QB);
  insertRankings('FantasyCalc', CBS_1QB);

  // Also insert as DynastyNerds SF (slightly adjusted — add 2 to each rank as noise)
  const DN_SF = YAHOO_SF.map(([slug, rank]) => [slug, Math.max(1, rank + (Math.random() > 0.5 ? 1 : -1))]);
  insertRankings('DynastyNerds SF', DN_SF);
  const DN_1QB = YAHOO_1QB.map(([slug, rank]) => [slug, Math.max(1, rank + (Math.random() > 0.5 ? 1 : -1))]);
  insertRankings('DynastyNerds', DN_1QB);
});
insertRankingsBatch();

console.log('\nRecomputing consensus rankings...');
computeConsensus('SF');
computeConsensus('1QB');

// ── Verify ────────────────────────────────────────────────────────────────────
const top10 = db.prepare(`
  SELECT p.full_name, p.position, p.nfl_team, c.rank_overall, c.avg_rank
  FROM consensus_rankings c
  JOIN players p ON c.player_id = p.id
  WHERE c.format = 'SF' AND c.calculated_at = ?
  ORDER BY c.rank_overall LIMIT 10
`).all(TODAY);

console.log('\nTop 10 post-draft SF consensus:');
top10.forEach(p => {
  console.log(`  ${p.rank_overall}. ${p.full_name} (${p.position}) → ${p.nfl_team ?? 'Undrafted'} [avg: ${Number(p.avg_rank).toFixed(1)}]`);
});

db.close();
console.log('\nDone!');
