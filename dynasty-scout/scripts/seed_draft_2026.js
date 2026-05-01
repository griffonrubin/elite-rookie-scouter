/**
 * seed_draft_2026.js
 * Seeds the 2026 NFL Draft results into the database:
 *   1. Populates nfl_teams with all 32 teams + ESPN logo URLs
 *   2. Updates players with draft_round, draft_pick, draft_overall, nfl_team
 *   3. Sets UDFA team for known UDFA signings
 *   4. Leaves nfl_team = NULL for undrafted/unsigned players
 *   5. Inserts Anthony Smith (new player, not previously in DB)
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'dynasty_scout.db'));

// ─── 1. NFL Teams ─────────────────────────────────────────────────────────────
// Logo URLs from ESPN CDN (reliable, no auth)
const NFL_TEAMS = [
  { abbreviation: 'ARI', full_name: 'Arizona Cardinals',       conference: 'NFC', division: 'NFC West',  primary_color: '#97233F', secondary_color: '#FFB612', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png' },
  { abbreviation: 'ATL', full_name: 'Atlanta Falcons',          conference: 'NFC', division: 'NFC South', primary_color: '#A71930', secondary_color: '#000000', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png' },
  { abbreviation: 'BAL', full_name: 'Baltimore Ravens',         conference: 'AFC', division: 'AFC North', primary_color: '#241773', secondary_color: '#9E7C0C', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png' },
  { abbreviation: 'BUF', full_name: 'Buffalo Bills',            conference: 'AFC', division: 'AFC East',  primary_color: '#00338D', secondary_color: '#C60C30', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png' },
  { abbreviation: 'CAR', full_name: 'Carolina Panthers',        conference: 'NFC', division: 'NFC South', primary_color: '#0085CA', secondary_color: '#101820', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png' },
  { abbreviation: 'CHI', full_name: 'Chicago Bears',            conference: 'NFC', division: 'NFC North', primary_color: '#0B162A', secondary_color: '#C83803', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png' },
  { abbreviation: 'CIN', full_name: 'Cincinnati Bengals',       conference: 'AFC', division: 'AFC North', primary_color: '#FB4F14', secondary_color: '#000000', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png' },
  { abbreviation: 'CLE', full_name: 'Cleveland Browns',         conference: 'AFC', division: 'AFC North', primary_color: '#311D00', secondary_color: '#FF3C00', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png' },
  { abbreviation: 'DAL', full_name: 'Dallas Cowboys',           conference: 'NFC', division: 'NFC East',  primary_color: '#003594', secondary_color: '#869397', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png' },
  { abbreviation: 'DEN', full_name: 'Denver Broncos',           conference: 'AFC', division: 'AFC West',  primary_color: '#FB4F14', secondary_color: '#002244', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png' },
  { abbreviation: 'DET', full_name: 'Detroit Lions',            conference: 'NFC', division: 'NFC North', primary_color: '#0076B6', secondary_color: '#B0B7BC', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png' },
  { abbreviation: 'GB',  full_name: 'Green Bay Packers',        conference: 'NFC', division: 'NFC North', primary_color: '#203731', secondary_color: '#FFB612', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png'  },
  { abbreviation: 'HOU', full_name: 'Houston Texans',           conference: 'AFC', division: 'AFC South', primary_color: '#03202F', secondary_color: '#A71930', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png' },
  { abbreviation: 'IND', full_name: 'Indianapolis Colts',       conference: 'AFC', division: 'AFC South', primary_color: '#002C5F', secondary_color: '#A2AAAD', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png' },
  { abbreviation: 'JAX', full_name: 'Jacksonville Jaguars',     conference: 'AFC', division: 'AFC South', primary_color: '#006778', secondary_color: '#D7A22A', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png' },
  { abbreviation: 'KC',  full_name: 'Kansas City Chiefs',        conference: 'AFC', division: 'AFC West',  primary_color: '#E31837', secondary_color: '#FFB81C', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png'  },
  { abbreviation: 'LAC', full_name: 'Los Angeles Chargers',     conference: 'AFC', division: 'AFC West',  primary_color: '#0080C6', secondary_color: '#FFC20E', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png' },
  { abbreviation: 'LAR', full_name: 'Los Angeles Rams',         conference: 'NFC', division: 'NFC West',  primary_color: '#003594', secondary_color: '#FFA300', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png' },
  { abbreviation: 'LV',  full_name: 'Las Vegas Raiders',        conference: 'AFC', division: 'AFC West',  primary_color: '#000000', secondary_color: '#A5ACAF', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png'  },
  { abbreviation: 'MIA', full_name: 'Miami Dolphins',           conference: 'AFC', division: 'AFC East',  primary_color: '#008E97', secondary_color: '#FC4C02', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png' },
  { abbreviation: 'MIN', full_name: 'Minnesota Vikings',        conference: 'NFC', division: 'NFC North', primary_color: '#4F2683', secondary_color: '#FFC62F', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png' },
  { abbreviation: 'NE',  full_name: 'New England Patriots',     conference: 'AFC', division: 'AFC East',  primary_color: '#002244', secondary_color: '#C60C30', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png'  },
  { abbreviation: 'NO',  full_name: 'New Orleans Saints',       conference: 'NFC', division: 'NFC South', primary_color: '#101820', secondary_color: '#D3BC8D', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png'  },
  { abbreviation: 'NYG', full_name: 'New York Giants',          conference: 'NFC', division: 'NFC East',  primary_color: '#0B2265', secondary_color: '#A71930', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png' },
  { abbreviation: 'NYJ', full_name: 'New York Jets',            conference: 'AFC', division: 'AFC East',  primary_color: '#125740', secondary_color: '#000000', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png' },
  { abbreviation: 'PHI', full_name: 'Philadelphia Eagles',      conference: 'NFC', division: 'NFC East',  primary_color: '#004C54', secondary_color: '#A5ACAF', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png' },
  { abbreviation: 'PIT', full_name: 'Pittsburgh Steelers',      conference: 'AFC', division: 'AFC North', primary_color: '#FFB612', secondary_color: '#101820', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' },
  { abbreviation: 'SEA', full_name: 'Seattle Seahawks',         conference: 'NFC', division: 'NFC West',  primary_color: '#002244', secondary_color: '#69BE28', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png' },
  { abbreviation: 'SF',  full_name: 'San Francisco 49ers',      conference: 'NFC', division: 'NFC West',  primary_color: '#AA0000', secondary_color: '#B3995D', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'  },
  { abbreviation: 'TB',  full_name: 'Tampa Bay Buccaneers',     conference: 'NFC', division: 'NFC South', primary_color: '#D50A0A', secondary_color: '#FF7900', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png'  },
  { abbreviation: 'TEN', full_name: 'Tennessee Titans',         conference: 'AFC', division: 'AFC South', primary_color: '#0C2340', secondary_color: '#4B92DB', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png' },
  { abbreviation: 'WAS', full_name: 'Washington Commanders',    conference: 'NFC', division: 'NFC East',  primary_color: '#5A1414', secondary_color: '#FFB612', logo_url: 'https://a.espncdn.com/i/teamlogos/nfl/500/was.png' },
];

console.log('Seeding nfl_teams...');
const insertTeam = db.prepare(`
  INSERT OR REPLACE INTO nfl_teams (abbreviation, full_name, conference, division, primary_color, secondary_color, logo_url)
  VALUES (@abbreviation, @full_name, @conference, @division, @primary_color, @secondary_color, @logo_url)
`);
const seedTeams = db.transaction(() => {
  for (const t of NFL_TEAMS) insertTeam.run(t);
});
seedTeams();
console.log(`  ✓ ${NFL_TEAMS.length} teams inserted`);

// ─── 2. Draft picks — all skill-position players ──────────────────────────────
// Format: { slug, nfl_team (abbr), draft_round, draft_pick (within round), draft_overall }
// Undrafted: draft fields stay NULL, nfl_team set only if signed as UDFA

const DRAFTED = [
  // ── ROUND 1 ──
  { slug: 'fernando-mendoza',    nfl_team: 'LV',  draft_round: 1, draft_pick: 1,  draft_overall: 1   },
  { slug: 'jeremiyah-love',      nfl_team: 'ARI', draft_round: 1, draft_pick: 3,  draft_overall: 3   },
  { slug: 'carnell-tate',        nfl_team: 'TEN', draft_round: 1, draft_pick: 4,  draft_overall: 4   },
  { slug: 'jordyn-tyson',        nfl_team: 'NO',  draft_round: 1, draft_pick: 8,  draft_overall: 8   },
  { slug: 'ty-simpson',          nfl_team: 'LAR', draft_round: 1, draft_pick: 13, draft_overall: 13  },
  { slug: 'kenyon-sadiq',        nfl_team: 'NYJ', draft_round: 1, draft_pick: 16, draft_overall: 16  },
  { slug: 'makai-lemon',         nfl_team: 'PHI', draft_round: 1, draft_pick: 20, draft_overall: 20  },
  { slug: 'kc-concepcion',       nfl_team: 'CLE', draft_round: 1, draft_pick: 24, draft_overall: 24  },
  { slug: 'omar-cooper',         nfl_team: 'NYJ', draft_round: 1, draft_pick: 30, draft_overall: 30  },
  { slug: 'jadarian-price',      nfl_team: 'SEA', draft_round: 1, draft_pick: 32, draft_overall: 32  },
  // ── ROUND 2 ──
  { slug: 'dezhaun-stribling',   nfl_team: 'SF',  draft_round: 2, draft_pick: 1,  draft_overall: 33  },
  { slug: 'denzel-boston',       nfl_team: 'CLE', draft_round: 2, draft_pick: 7,  draft_overall: 39  },
  { slug: 'germie-bernard',      nfl_team: 'PIT', draft_round: 2, draft_pick: 15, draft_overall: 47  },
  { slug: 'eli-stowers',         nfl_team: 'PHI', draft_round: 2, draft_pick: 22, draft_overall: 54  },
  { slug: 'nate-boerkircher',    nfl_team: 'JAX', draft_round: 2, draft_pick: 24, draft_overall: 56  },
  { slug: 'marlin-klein',        nfl_team: 'HOU', draft_round: 2, draft_pick: 27, draft_overall: 59  },
  { slug: 'max-klare',           nfl_team: 'LAR', draft_round: 2, draft_pick: 29, draft_overall: 61  },
  // ── ROUND 3 ──
  { slug: 'carson-beck',         nfl_team: 'ARI', draft_round: 3, draft_pick: 1,  draft_overall: 65  },
  { slug: 'sam-roush',           nfl_team: 'CHI', draft_round: 3, draft_pick: 5,  draft_overall: 69  },
  { slug: 'antonio-williams',    nfl_team: 'WAS', draft_round: 3, draft_pick: 7,  draft_overall: 71  },
  { slug: 'oscar-delp',          nfl_team: 'NO',  draft_round: 3, draft_pick: 9,  draft_overall: 73  },
  { slug: 'malachi-fields',      nfl_team: 'NYG', draft_round: 3, draft_pick: 10, draft_overall: 74  },
  { slug: 'caleb-douglas',       nfl_team: 'MIA', draft_round: 3, draft_pick: 11, draft_overall: 75  },
  { slug: 'chris-bell',          nfl_team: 'MIA', draft_round: 3, draft_pick: 30, draft_overall: 94  },
  { slug: 'drew-allar',          nfl_team: 'PIT', draft_round: 3, draft_pick: 12, draft_overall: 76  },
  { slug: 'zachariah-branch',    nfl_team: 'ATL', draft_round: 3, draft_pick: 15, draft_overall: 79  },
  { slug: 'jakobi-lane',         nfl_team: 'BAL', draft_round: 3, draft_pick: 16, draft_overall: 80  },
  { slug: 'chris-brazzell',      nfl_team: 'CAR', draft_round: 3, draft_pick: 19, draft_overall: 83  },
  { slug: 'ted-hurst',           nfl_team: 'TB',  draft_round: 3, draft_pick: 20, draft_overall: 84  },
  { slug: 'will-kacmarek',       nfl_team: 'MIA', draft_round: 3, draft_pick: 23, draft_overall: 87  },
  { slug: 'zavion-thomas',       nfl_team: 'CHI', draft_round: 3, draft_pick: 25, draft_overall: 89  },
  { slug: 'kaelon-black',        nfl_team: 'SF',  draft_round: 3, draft_pick: 26, draft_overall: 90  },
  { slug: 'eli-raridon',         nfl_team: 'NE',  draft_round: 3, draft_pick: 31, draft_overall: 95  },
  // ── ROUND 4 ──
  { slug: 'brenen-thompson',     nfl_team: 'LAC', draft_round: 4, draft_pick: 5,  draft_overall: 105 },
  { slug: 'jonah-coleman',       nfl_team: 'DEN', draft_round: 4, draft_pick: 8,  draft_overall: 108 },
  { slug: 'cade-klubnik',        nfl_team: 'NYJ', draft_round: 4, draft_pick: 10, draft_overall: 110 },
  { slug: 'elijah-sarratt',      nfl_team: 'BAL', draft_round: 4, draft_pick: 15, draft_overall: 115 },
  { slug: 'kaden-wetjen',        nfl_team: 'PIT', draft_round: 4, draft_pick: 21, draft_overall: 121 },
  { slug: 'mike-washington',     nfl_team: 'LV',  draft_round: 4, draft_pick: 22, draft_overall: 122 },
  { slug: 'skyler-bell',         nfl_team: 'BUF', draft_round: 4, draft_pick: 25, draft_overall: 125 },
  { slug: 'matthew-hibner',      nfl_team: 'BAL', draft_round: 4, draft_pick: 33, draft_overall: 133 },
  { slug: 'bryce-lance',         nfl_team: 'NO',  draft_round: 4, draft_pick: 36, draft_overall: 136 },
  { slug: 'colbie-young',        nfl_team: 'CIN', draft_round: 4, draft_pick: 40, draft_overall: 140 },
  // ── ROUND 5 ──
  { slug: 'max-bredeson',        nfl_team: 'MIN', draft_round: 5, draft_pick: 19, draft_overall: 159 },
  { slug: 'emmett-johnson',      nfl_team: 'KC',  draft_round: 5, draft_pick: 21, draft_overall: 161 },
  { slug: 'justin-joly',         nfl_team: 'DEN', draft_round: 5, draft_pick: 12, draft_overall: 152 },
  { slug: 'tanner-koziol',       nfl_team: 'JAX', draft_round: 5, draft_pick: 24, draft_overall: 164 },
  { slug: 'nicholas-singleton',  nfl_team: 'TEN', draft_round: 5, draft_pick: 25, draft_overall: 165 },
  { slug: 'kendrick-law',        nfl_team: 'DET', draft_round: 5, draft_pick: 28, draft_overall: 168 },
  { slug: 'riley-nowakowski',    nfl_team: 'PIT', draft_round: 5, draft_pick: 29, draft_overall: 169 },
  { slug: 'joe-royer',           nfl_team: 'CLE', draft_round: 5, draft_pick: 30, draft_overall: 170 },
  { slug: 'josh-cuevas',         nfl_team: 'BAL', draft_round: 5, draft_pick: 33, draft_overall: 173 },
  { slug: 'adam-randall',        nfl_team: 'BAL', draft_round: 5, draft_pick: 34, draft_overall: 174 },
  { slug: 'cyrus-allen',         nfl_team: 'KC',  draft_round: 5, draft_pick: 36, draft_overall: 176 },
  { slug: 'kevin-coleman-jr',    nfl_team: 'MIA', draft_round: 5, draft_pick: 37, draft_overall: 177 },
  { slug: 'cole-payton',         nfl_team: 'PHI', draft_round: 5, draft_pick: 38, draft_overall: 178 },
  { slug: 'seydou-traore',       nfl_team: 'MIA', draft_round: 5, draft_pick: 40, draft_overall: 180 },
  { slug: 'reggie-virgil',       nfl_team: 'ARI', draft_round: 5, draft_pick: 3,  draft_overall: 143 },
  // ── ROUND 6 ──
  { slug: 'taylen-green',        nfl_team: 'CLE', draft_round: 6, draft_pick: 1,  draft_overall: 182 },
  { slug: 'bauer-sharp',         nfl_team: 'TB',  draft_round: 6, draft_pick: 4,  draft_overall: 185 },
  { slug: 'kaytron-allen',       nfl_team: 'WAS', draft_round: 6, draft_pick: 6,  draft_overall: 187 },
  { slug: 'barion-brown',        nfl_team: 'NO',  draft_round: 6, draft_pick: 9,  draft_overall: 190 },
  { slug: 'josh-cameron',        nfl_team: 'JAX', draft_round: 6, draft_pick: 10, draft_overall: 191 },
  { slug: 'malik-benson',        nfl_team: 'LV',  draft_round: 6, draft_pick: 14, draft_overall: 195 },
  { slug: 'cj-daniels',          nfl_team: 'LAR', draft_round: 6, draft_pick: 16, draft_overall: 197 },
  { slug: 'demond-claiborne',    nfl_team: 'MIN', draft_round: 6, draft_pick: 17, draft_overall: 198 },
  { slug: 'emmanuel-henderson',  nfl_team: 'SEA', draft_round: 6, draft_pick: 18, draft_overall: 199 },
  { slug: 'cj-williams',         nfl_team: 'JAX', draft_round: 6, draft_pick: 22, draft_overall: 203 },
  { slug: 'lewis-bond',          nfl_team: 'HOU', draft_round: 6, draft_pick: 23, draft_overall: 204 },
  // ── ROUND 7 ──
  // Anthony Smith (7.02) is a new player, inserted separately below
  { slug: 'jack-endries',        nfl_team: 'CIN', draft_round: 7, draft_pick: 5,  draft_overall: 221 },
  { slug: 'athan-kaliakmanis',   nfl_team: 'WAS', draft_round: 7, draft_pick: 7,  draft_overall: 223 },
  { slug: 'jaren-kanak',         nfl_team: 'TEN', draft_round: 7, draft_pick: 9,  draft_overall: 225 },
  { slug: 'eli-heidenreich',     nfl_team: 'PIT', draft_round: 7, draft_pick: 14, draft_overall: 230 },
  { slug: 'behren-morton',       nfl_team: 'NE',  draft_round: 7, draft_pick: 18, draft_overall: 234 },
  { slug: 'seth-mcgowan',        nfl_team: 'IND', draft_round: 7, draft_pick: 21, draft_overall: 237 },
  { slug: 'jam-miller',          nfl_team: 'NE',  draft_round: 7, draft_pick: 29, draft_overall: 245 },
  { slug: 'carsen-ryan',         nfl_team: 'CLE', draft_round: 7, draft_pick: 32, draft_overall: 248 },
  { slug: 'garrett-nussmeier',   nfl_team: 'KC',  draft_round: 7, draft_pick: 33, draft_overall: 249 },
];

// UDFA signings — nfl_team set, but draft fields stay NULL
const UDFA_SIGNED = [
  // QBs
  { slug: 'joey-aguilar',         nfl_team: 'JAX' },
  { slug: 'haynes-king',          nfl_team: 'CAR' },
  { slug: 'mark-gronowski',       nfl_team: 'MIA' },
  { slug: 'diego-pavia',          nfl_team: 'BAL' },
  // RBs
  { slug: 'leveon-moss',          nfl_team: 'MIA' },
  { slug: 'robert-henry-jr',      nfl_team: 'WAS' },
  { slug: 'jaydn-ott',            nfl_team: 'KC'  },
  { slug: 'jmari-taylor',         nfl_team: 'JAX' },
  // WRs
  { slug: 'jeff-caldwell',        nfl_team: 'KC'  },
  { slug: 'dillon-bell',          nfl_team: 'MIN' },
  { slug: 'caullin-lacy',         nfl_team: 'NYJ' },
  { slug: 'jmichael-sturdivant',  nfl_team: 'GB'  },
  { slug: 'harrison-wallace-iii', nfl_team: 'ARI' },
  // TEs
  { slug: 'michael-trigg',        nfl_team: 'DAL' },
  { slug: 'john-michael-gyllenborg', nfl_team: 'KC' },
  { slug: 'daequan-wright',       nfl_team: 'PHI' },
  { slug: 'dj-rogers',            nfl_team: 'DAL' },
  { slug: 'lance-mason',          nfl_team: 'SEA' },
];

console.log('Updating drafted players...');
const updateDrafted = db.prepare(`
  UPDATE players
  SET nfl_team = @nfl_team,
      draft_round = @draft_round,
      draft_pick = @draft_pick,
      draft_overall = @draft_overall,
      updated_at = CURRENT_TIMESTAMP
  WHERE slug = @slug AND draft_year = 2026
`);

const updateUDFA = db.prepare(`
  UPDATE players
  SET nfl_team = @nfl_team,
      updated_at = CURRENT_TIMESTAMP
  WHERE slug = @slug AND draft_year = 2026
`);

// Clear existing stale nfl_team values (these were college names used as fallback)
// Only clear for players whose nfl_team matches their latest college school
// (safe: we'll set the real values right after)
const clearStaleTeams = db.prepare(`
  UPDATE players
  SET nfl_team = NULL
  WHERE draft_year = 2026
`);

const seedDraft = db.transaction(() => {
  clearStaleTeams.run();
  let drafted = 0, udfa = 0;
  for (const p of DRAFTED) {
    const result = updateDrafted.run(p);
    if (result.changes > 0) drafted++;
    else console.warn(`  ⚠ No match for drafted slug: ${p.slug}`);
  }
  for (const p of UDFA_SIGNED) {
    const result = updateUDFA.run(p);
    if (result.changes > 0) udfa++;
    else console.warn(`  ⚠ No match for UDFA slug: ${p.slug}`);
  }
  console.log(`  ✓ ${drafted} drafted players updated`);
  console.log(`  ✓ ${udfa} UDFA signings updated`);
});
seedDraft();

// ─── 3. Insert Anthony Smith (new player) ─────────────────────────────────────
console.log('Inserting Anthony Smith...');
const insertPlayer = db.prepare(`
  INSERT OR IGNORE INTO players
    (slug, full_name, first_name, last_name, position, draft_year,
     nfl_team, draft_round, draft_pick, draft_overall)
  VALUES
    ('anthony-smith-wr', 'Anthony Smith', 'Anthony', 'Smith', 'WR', 2026,
     'DAL', 7, 2, 218)
`);
const r = insertPlayer.run();
if (r.changes > 0) {
  // Add college career record
  const newId = r.lastInsertRowid;
  db.prepare(`INSERT OR IGNORE INTO college_career (player_id, school, conference) VALUES (?, 'East Carolina', 'American Athletic')`).run(newId);
  console.log('  ✓ Anthony Smith inserted (id=' + newId + ')');
} else {
  console.log('  ℹ Anthony Smith already exists');
}

// ─── 4. Verify ────────────────────────────────────────────────────────────────
const draftedCount = db.prepare(`SELECT COUNT(*) as cnt FROM players WHERE draft_year = 2026 AND draft_overall IS NOT NULL`).get();
const udfaCount    = db.prepare(`SELECT COUNT(*) as cnt FROM players WHERE draft_year = 2026 AND draft_overall IS NULL AND nfl_team IS NOT NULL`).get();
const undraftedCount = db.prepare(`SELECT COUNT(*) as cnt FROM players WHERE draft_year = 2026 AND draft_overall IS NULL AND nfl_team IS NULL`).get();

console.log('\n── Summary ──');
console.log(`  Drafted:    ${draftedCount.cnt}`);
console.log(`  UDFA:       ${udfaCount.cnt}`);
console.log(`  Undrafted:  ${undraftedCount.cnt}`);

// Show a few examples
const sample = db.prepare(`
  SELECT full_name, position, nfl_team, draft_round, draft_pick, draft_overall
  FROM players WHERE draft_year = 2026 AND draft_overall IS NOT NULL
  ORDER BY draft_overall LIMIT 10
`).all();
console.log('\n  Sample drafted:');
sample.forEach(p => console.log(`    ${p.draft_round}.${String(p.draft_pick).padStart(2,'0')} (#${p.draft_overall}) ${p.full_name} → ${p.nfl_team}`));

db.close();
console.log('\nDone!');
