// ---------------------------------------------------------------------------
// Player archetype auto-tagger
// Returns 1-3 archetype badges based on stats + measurables
// ---------------------------------------------------------------------------

/** Tailwind color classes keyed by archetype *category*. */
const COLOR = {
  speed:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  size:        'bg-amber-500/15 text-amber-400 border-amber-500/40',
  production:  'bg-violet-500/15 text-violet-400 border-violet-500/40',
  versatility: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
} as const;

type ArchetypeTag = { label: string; color: string };

// ---------------------------------------------------------------------------
// Helpers — safe property access with numeric coercion
// ---------------------------------------------------------------------------

function n(player: any, key: string): number | undefined {
  const v = player[key];
  if (v == null || v === '' || v === '—') return undefined;
  const num = Number(v);
  return Number.isFinite(num) ? num : undefined;
}

/** Divides a / b, returning undefined when either operand is missing or b is 0. */
function ratio(player: any, numKey: string, denKey: string): number | undefined {
  const a = n(player, numKey);
  const b = n(player, denKey);
  if (a == null || b == null || b === 0) return undefined;
  return a / b;
}

// ---------------------------------------------------------------------------
// Per-position archetype rules
// ---------------------------------------------------------------------------

function rbArchetypes(p: any): ArchetypeTag[] {
  const tags: ArchetypeTag[] = [];

  const forty        = n(p, 'forty_yard');
  const speedScore   = n(p, 'speed_score');
  const weight       = n(p, 'weight_lbs');
  const bestYpc      = n(p, 'best_ypc');
  const bestYpr      = n(p, 'best_ypr');
  const recPerGame   = ratio(p, 'career_receptions', 'career_games');
  const attPerGame   = ratio(p, 'career_rush_attempts', 'career_games');
  const bestDom      = n(p, 'best_dominator');

  // Speed Back — athletic / speed category
  if ((forty != null && forty < 4.45) || (speedScore != null && speedScore >= 105)) {
    tags.push({ label: 'Speed Back', color: COLOR.speed });
  }

  // Power Back — size category
  if (weight != null && weight >= 215 && bestYpc != null && bestYpc >= 5.0) {
    tags.push({ label: 'Power Back', color: COLOR.size });
  }

  // Pass Catcher — versatility
  if ((bestYpr != null && bestYpr >= 10) || (recPerGame != null && recPerGame > 3)) {
    tags.push({ label: 'Pass Catcher', color: COLOR.versatility });
  }

  // Workhorse — production
  if (attPerGame != null && attPerGame > 18) {
    tags.push({ label: 'Workhorse', color: COLOR.production });
  }

  // Explosive — production
  if (bestDom != null && bestDom >= 25) {
    tags.push({ label: 'Explosive', color: COLOR.production });
  }

  return tags;
}

function wrArchetypes(p: any): ArchetypeTag[] {
  const tags: ArchetypeTag[] = [];

  const forty        = n(p, 'forty_yard');
  const speedScore   = n(p, 'speed_score');
  const height       = n(p, 'height_inches');
  const weight       = n(p, 'weight_lbs');
  const bestYpr      = n(p, 'best_ypr');
  const careerRec    = n(p, 'career_receptions');
  const bestDom      = n(p, 'best_dominator');

  // Burner — speed
  if ((forty != null && forty < 4.40) || (speedScore != null && speedScore >= 100)) {
    tags.push({ label: 'Burner', color: COLOR.speed });
  }

  // Contested Catch — size
  if (height != null && height >= 74 && weight != null && weight >= 200) {
    tags.push({ label: 'Contested Catch', color: COLOR.size });
  }

  // Slot — versatility
  if (height != null && height <= 72 && forty != null && forty < 4.50) {
    tags.push({ label: 'Slot', color: COLOR.versatility });
  }

  // YAC Monster — production
  if (bestYpr != null && bestYpr < 12 && careerRec != null && careerRec > 100) {
    tags.push({ label: 'YAC Monster', color: COLOR.production });
  }

  // Alpha — production
  if (bestDom != null && bestDom >= 30) {
    tags.push({ label: 'Alpha', color: COLOR.production });
  }

  return tags;
}

function teArchetypes(p: any): ArchetypeTag[] {
  const tags: ArchetypeTag[] = [];

  const bestYpr      = n(p, 'best_ypr');
  const careerRecYds = n(p, 'career_rec_yards');
  const ras          = n(p, 'ras');
  const speedScore   = n(p, 'speed_score');
  const weight       = n(p, 'weight_lbs');

  // Receiving TE — versatility
  if ((bestYpr != null && bestYpr >= 12) || (careerRecYds != null && careerRecYds > 800)) {
    tags.push({ label: 'Receiving TE', color: COLOR.versatility });
  }

  // Athletic Freak — speed
  if ((ras != null && ras >= 8.5) || (speedScore != null && speedScore >= 95)) {
    tags.push({ label: 'Athletic Freak', color: COLOR.speed });
  }

  // Inline — size
  if (weight != null && weight >= 250) {
    tags.push({ label: 'Inline', color: COLOR.size });
  }

  return tags;
}

function qbArchetypes(p: any): ArchetypeTag[] {
  const tags: ArchetypeTag[] = [];

  const careerRushYds = n(p, 'career_rush_yards');
  const forty         = n(p, 'forty_yard');
  const careerPassYds = n(p, 'career_pass_yards');
  const bestPassYpg   = n(p, 'best_pass_ypg');
  const careerYpa     = n(p, 'career_ypa');
  const careerCompPct = n(p, 'career_comp_pct');

  // Dual Threat — speed
  if ((careerRushYds != null && careerRushYds > 800) || (forty != null && forty < 4.65)) {
    tags.push({ label: 'Dual Threat', color: COLOR.speed });
  }

  // Pocket Passer — size (traditional / build-based)
  if (
    careerPassYds != null && careerPassYds > 5000 &&
    (careerRushYds == null || careerRushYds < 500)
  ) {
    tags.push({ label: 'Pocket Passer', color: COLOR.size });
  }

  // Gunslinger — production
  if ((bestPassYpg != null && bestPassYpg >= 280) || (careerYpa != null && careerYpa >= 8.5)) {
    tags.push({ label: 'Gunslinger', color: COLOR.production });
  }

  // Game Manager — versatility
  if (careerCompPct != null && careerCompPct >= 68) {
    tags.push({ label: 'Game Manager', color: COLOR.versatility });
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MAX_TAGS = 3;

export function getArchetypes(
  player: { position: string; [key: string]: any },
): ArchetypeTag[] {
  const pos = (player.position ?? '').toUpperCase();

  let tags: ArchetypeTag[];

  switch (pos) {
    case 'RB': tags = rbArchetypes(player); break;
    case 'WR': tags = wrArchetypes(player); break;
    case 'TE': tags = teArchetypes(player); break;
    case 'QB': tags = qbArchetypes(player); break;
    default:   tags = [];
  }

  return tags.slice(0, MAX_TAGS);
}
