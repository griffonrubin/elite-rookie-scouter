import { query, getDb } from '@/lib/db';
import { dstKey, ESPN_POSITIONS, normalizeName } from '@/lib/espnPlayers';
import { buildConsensus, DatedRank, SOURCE_WEIGHTS } from '@/lib/redraftConsensus';

/**
 * Refresh the three ranking sources the CSV export does not carry, and
 * rebuild the consensus over everything.
 *
 * FantasyPros, FantasyCalc and KeepTradeCut have no column in the Flock
 * export, so the only way to update them is to go and read them — which the
 * local pipeline does, from a machine with a route to those sites. This is
 * the server-side twin of scrapers/redraft/{fp,fantasycalc,ktc}_redraft.py,
 * for when that machine is not available.
 *
 * The consensus is rebuilt in the same pass, because fresher source ranks
 * with a stale consensus leave the board's consensus column disagreeing with
 * the columns beside it. That means a second implementation of the consensus
 * arithmetic, which is only safe because it is held to matching the Python
 * exactly — see lib/redraftConsensus.ts and scripts/consensus_parity.ts.
 *
 * Lives here rather than in the route so the daily projections cron can run
 * it too: the Hobby plan allows few enough scheduled jobs that this shares
 * one with the projections rather than claiming another.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const SOURCES = {
    fantasypros: {
        source: 'FantasyPros PPR',
        url: 'https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php',
    },
    fantasycalc: {
        source: 'FantasyCalc Redraft',
        url: 'https://fantasycalc.com',
        api: 'https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&ppr=1',
    },
    sleeper: {
        source: 'Sleeper Redraft',
        url: 'https://sleeper.com',
        api: 'https://api.sleeper.com/projections/nfl/2026?season_type=regular'
            + ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => `&position[]=${p}`).join('')
            + '&order_by=pts_ppr',
    },
    espn: {
        source: 'ESPN Redraft',
        url: 'https://www.espn.com/fantasy/football/',
        api: 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/'
            + '2026/segments/0/leaguedefaults/3?view=kona_player_info',
    },
    cbs: {
        source: 'CBS Redraft',
        url: 'https://www.cbssports.com/fantasy/football/rankings/ppr/top200/',
    },
    ktc: {
        source: 'KeepTradeCut Redraft',
        url: 'https://keeptradecut.com/fantasy-rankings',
    },
} as const;

/** Same aliases the Python base scraper applies. */
const POSITION_ALIASES: Record<string, string> = {
    PK: 'K', DEF: 'DST', 'D/ST': 'DST', D: 'DST', DL: 'DST',
};

export interface PoolPlayer {
    id: number;
    full_name: string;
    position: string | null;
    nfl_team: string | null;
    sleeper_id: string | null;
    espn_nfl_id: string | null;
    fantasypros_id: string | null;
}

/** One matched source row, before the dense re-rank. */
interface Entry { pid: number; raw: number; pos: string; tier: number | null }

/**
 * Resolve source rows to pool players.
 *
 * Mirrors base_redraft_scraper.find_player: an explicit crosswalk id wins,
 * then name plus position. Team defenses match on the team, then on the
 * nickname, since every source spells them differently.
 */
class Matcher {
    private byId = new Map<string, Map<string, number>>();
    private byNamePos = new Map<string, number>();
    private byDstTeam = new Map<string, number>();
    private byDstName = new Map<string, number>();
    /** Pool position per player, for sources that do not report one. */
    private pos = new Map<number, string>();

    constructor(pool: PoolPlayer[]) {
        for (const key of ['sleeper_id', 'espn_nfl_id', 'fantasypros_id']) {
            this.byId.set(key, new Map());
        }
        for (const p of pool) {
            const pos = normPos(p.position);
            this.pos.set(p.id, pos);
            // Team defenses are indexed by id as well as by team and
            // nickname: Sleeper identifies one only by its id, so leaving
            // them out of the id map dropped all 32 from that source.
            for (const key of ['sleeper_id', 'espn_nfl_id', 'fantasypros_id'] as const) {
                const v = p[key];
                if (v) this.byId.get(key)!.set(String(v), p.id);
            }
            if (pos === 'DST') {
                if (p.nfl_team) this.byDstTeam.set(p.nfl_team.toUpperCase(), p.id);
                const nick = dstKey(p.full_name);
                if (nick) this.byDstName.set(nick, p.id);
                continue;
            }
            this.byNamePos.set(`${normalizeName(p.full_name)}|${pos}`, p.id);
        }
    }

    find(name: string, position: string, team: string | null,
         ids: Partial<Record<'sleeper_id' | 'espn_nfl_id' | 'fantasypros_id', unknown>> = {},
    ): number | null {
        const pos = normPos(position);
        if (pos === 'DST') {
            const byTeam = team ? this.byDstTeam.get(team.toUpperCase()) : undefined;
            if (byTeam) return byTeam;
            const byNick = this.byDstName.get(dstKey(name));
            if (byNick) return byNick;
            // fall through to the id lookup below
        }
        for (const key of ['sleeper_id', 'espn_nfl_id', 'fantasypros_id'] as const) {
            const v = ids[key];
            if (v != null && v !== '') {
                const hit = this.byId.get(key)!.get(String(v));
                if (hit) return hit;
            }
        }
        if (!name) return null;
        return this.byNamePos.get(`${normalizeName(name)}|${pos}`) ?? null;
    }

    /** The position we hold for a matched player. */
    positionOf(pid: number): string {
        return this.pos.get(pid) ?? '';
    }
}

function normPos(raw: string | null): string {
    const p = (raw || '').toUpperCase().trim();
    return POSITION_ALIASES[p] ?? p;
}

async function getText(url: string): Promise<string> {
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return res.text();
}

// ── the three sources ───────────────────────────────────────────────────────

async function fetchFantasyPros(m: Matcher): Promise<Entry[]> {
    const html = await getText(SOURCES.fantasypros.url);
    const blob = html.match(/var\s+ecrData\s*=\s*(\{[\s\S]*?\});/);
    if (!blob) throw new Error('ecrData blob not found — FantasyPros changed their layout');
    const players = JSON.parse(blob[1])?.players ?? [];
    if (!Array.isArray(players) || players.length === 0) {
        throw new Error('ecrData contained no players');
    }
    return collect(players, (p: any) => ({
        name: p.player_name, pos: p.player_position_id, team: p.player_team_id,
        raw: Number(p.rank_ecr), tier: numOrNull(p.tier),
        ids: { fantasypros_id: p.player_id },
    }), m);
}

async function fetchFantasyCalc(m: Matcher): Promise<Entry[]> {
    const res = await fetch(SOURCES.fantasycalc.api, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`${res.status} from api.fantasycalc.com`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('FantasyCalc returned an empty list');
    }
    return collect(data, (row: any) => {
        const p = row.player ?? {};
        return {
            name: p.name, pos: p.position, team: p.maybeTeam,
            raw: Number(row.overallRank), tier: numOrNull(row.maybeTier),
            ids: { sleeper_id: p.sleeperId, espn_nfl_id: p.espnId },
        };
    }, m);
}

/**
 * KeepTradeCut.
 *
 * The local scraper drives a headless browser and reads the `playersArray`
 * global, which no serverless function can do. The array is defined by an
 * inline <script> in the page itself, so the same data is reachable by
 * reading the HTML — if that ever stops being true, this says so plainly
 * rather than writing a half-empty source.
 */
async function fetchKtc(m: Matcher): Promise<Entry[]> {
    const html = await getText(SOURCES.ktc.url);
    const blob = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
    if (!blob) {
        throw new Error('playersArray is not inline in the HTML — KTC now needs a browser');
    }
    const players = JSON.parse(blob[1]);
    if (!Array.isArray(players) || players.length === 0) {
        throw new Error('playersArray was empty');
    }
    const rows = players
        .map((p: any) => ({ p, rank: Number(p?.oneQBValues?.startSitOverallRank) }))
        .filter(r => Number.isFinite(r.rank) && r.rank > 0);
    if (rows.length === 0) throw new Error('no startSit ranks present — KTC changed their schema');
    return collect(rows, ({ p, rank }: any) => ({
        name: p.playerName, pos: p.position, team: p.team,
        raw: rank, tier: numOrNull(p.oneQBValues?.startSitOverallTier), ids: {},
    }), m);
}

/**
 * Sleeper, ranked by PPR average draft position.
 *
 * A market signal rather than an editorial board — where players actually
 * go — which is why it is worth carrying alongside the expert lists. Rows
 * key on the player id already stored on every pooled player, so matching
 * is exact. Projections come from the same payload but are left to the
 * projections cron, which owns that table.
 */
async function fetchSleeper(m: Matcher): Promise<Entry[]> {
    const res = await fetch(SOURCES.sleeper.api, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`${res.status} from api.sleeper.com`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Sleeper returned no projection rows');
    }
    const out = collect(rows, (row: any) => ({
        name: '', pos: '', team: null,
        raw: Number(row?.stats?.adp_ppr),
        tier: null,
        ids: { sleeper_id: row?.player_id },
    }), m);
    if (out.length === 0) throw new Error('no adp_ppr values — Sleeper changed their schema');
    return out;
}

/**
 * ESPN's PPR draft ranks, out of the same kona payload the projections cron
 * reads. Fetched separately rather than shared with it so neither pass can
 * fail the other; it is one request a day.
 */
async function fetchEspn(m: Matcher): Promise<Entry[]> {
    const res = await fetch(SOURCES.espn.api, {
        headers: {
            'User-Agent': UA,
            Accept: 'application/json',
            'X-Fantasy-Filter': JSON.stringify({
                players: {
                    limit: 900,
                    sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'PPR' },
                },
            }),
            'X-Fantasy-Source': 'kona',
            'X-Fantasy-Platform': 'kona-PROD',
        },
        cache: 'no-store', signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${res.status} from lm-api-reads.fantasy.espn.com`);
    const players = (await res.json())?.players ?? [];
    if (!Array.isArray(players) || players.length === 0) {
        throw new Error('kona_player_info returned no players');
    }
    const out = collect(players, (entry: any) => {
        const p = entry?.player ?? {};
        return {
            name: p.fullName, pos: ESPN_POSITIONS[p.defaultPositionId] ?? '',
            team: null,
            // ESPN ranks against its whole player universe — values reach
            // 1972 for ~830 ranked players — so the dense position is what
            // gets stored, and this raw number only orders them.
            raw: Number(p?.draftRanksByRankType?.PPR?.rank),
            tier: null,
            ids: { espn_nfl_id: p.id },
        };
    }, m);
    if (out.length === 0) throw new Error('no PPR draft ranks found — ESPN changed their schema');
    return out;
}

/**
 * CBS's PPR top 200.
 *
 * The only one of these that is genuinely scraped rather than read from a
 * data endpoint, so it is also the most likely to break. Rows are split on
 * the row marker rather than matched whole, because CBS nests its divs
 * differently for players and for team defenses.
 */
async function fetchCbs(m: Matcher): Promise<Entry[]> {
    const html = await getText(SOURCES.cbs.url);
    const chunks = html.split('<div class="player-row');
    if (chunks.length < 20) throw new Error('no player rows found — CBS changed their layout');

    const seen = new Set<number>();
    const rows: { name: string; pos: string; raw: number }[] = [];
    for (const chunk of chunks.slice(1)) {
        const rank = Number(chunk.match(/<div class="rank">(\d+)<\/div>/)?.[1]);
        const slug = chunk.match(/href="\/nfl\/(?:players|teams)\/[^/]+\/([a-z0-9-]+)\//)?.[1];
        if (!rank || !slug || seen.has(rank)) continue;
        seen.add(rank);
        const pos = (chunk.match(/<span class="team position">\s*([A-Z/]+)/)?.[1] ?? '').toUpperCase();
        // CBS slugs are the full hyphenated name, which maps onto our own.
        rows.push({ name: slug.replace(/-/g, ' '), pos, raw: rank });
    }
    const out = collect(rows, r => ({
        name: r.name, pos: r.pos, team: null, raw: r.raw, tier: null, ids: {},
    }), m);
    if (out.length === 0) throw new Error('parsed rows but matched nothing — check the slug pattern');
    return out;
}

function numOrNull(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function collect<T>(
    rows: T[],
    read: (row: T) => { name: string; pos: string; team: string | null; raw: number;
                        tier: number | null; ids: Record<string, unknown> },
    m: Matcher,
): Entry[] {
    const out: Entry[] = [];
    for (const row of rows) {
        const r = read(row);
        // Sleeper names nobody — it reports an id and an ADP — so a row is
        // usable with either a name or an id, not only with a name.
        const hasId = Object.values(r.ids).some(v => v != null && v !== '');
        if ((!r.name && !hasId) || !Number.isFinite(r.raw)) continue;
        const pid = m.find(r.name, r.pos, r.team, r.ids);
        if (!pid) continue;
        // rank_positional counts within a position, so a source that does
        // not report one has to borrow ours or every row lands in one bucket.
        out.push({ pid, raw: r.raw, pos: normPos(r.pos) || m.positionOf(pid), tier: r.tier });
    }
    return out;
}

// ── the write ───────────────────────────────────────────────────────────────

/**
 * Store a source's ranks as a dense 1..N ordering, keeping the native number
 * in `value` — the same contract as base_redraft_scraper.save_dense_rankings,
 * because the consensus converts ranks to percentiles and needs a dense one.
 */
function densify(entries: Entry[]) {
    const rows = [...entries].sort((a, b) => a.raw - b.raw);
    const seen = new Set<number>();
    const posCount: Record<string, number> = {};
    const out: (Entry & { overall: number; positional: number })[] = [];
    for (const e of rows) {
        // Two source rows can resolve to one player; keep the better rank,
        // or the 1..N sequence ends up with a hole in it.
        if (seen.has(e.pid)) continue;
        seen.add(e.pid);
        posCount[e.pos] = (posCount[e.pos] ?? 0) + 1;
        out.push({ ...e, overall: out.length + 1, positional: posCount[e.pos] });
    }
    return out;
}

async function save(source: string, sourceUrl: string, entries: Entry[], today: string) {
    const rows = densify(entries);
    for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const params: (number | string | null)[] = [];
        const values = chunk.map(r => {
            const b = params.length;
            params.push(r.pid, source, r.overall, r.positional, r.tier, sourceUrl, today, r.raw);
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
        });
        await getDb().prepare(
            `INSERT INTO rankings
               (player_id, source, rank_overall, rank_positional, tier,
                source_url, scraped_at, value)
             VALUES ${values.join(',')}
             ON CONFLICT (player_id, source, scraped_at) DO UPDATE SET
               rank_overall    = excluded.rank_overall,
               rank_positional = excluded.rank_positional,
               tier            = excluded.tier,
               source_url      = excluded.source_url,
               value           = excluded.value`,
        ).run(params);
    }
    return rows;
}

/**
 * Recompute the consensus from every source's newest rank per player.
 *
 * Mirrors run_redraft_consensus.py's query exactly, down to the `< 999`
 * guard: a rank of 999 is the sentinel a couple of sources use for "listed
 * but unranked", and treating it as a real rank would drag those players up
 * past genuinely unranked ones.
 */
export async function rebuildConsensus(today: string): Promise<number> {
    const sources = Object.keys(SOURCE_WEIGHTS);
    const ph = sources.map((_, i) => `$${i + 1}`).join(',');
    const rows = await query<{ player_id: number; source: string;
                              rank_overall: number; scraped_at: string }>(
        `SELECT r.player_id, r.source, r.rank_overall, r.scraped_at
           FROM rankings r
           JOIN (SELECT player_id, source, MAX(scraped_at) AS max_date
                   FROM rankings GROUP BY player_id, source) latest
             ON r.player_id = latest.player_id AND r.source = latest.source
            AND r.scraped_at = latest.max_date
          WHERE r.rank_overall IS NOT NULL AND r.rank_overall < 999
            AND r.source IN (${ph})`, sources);

    // A rank means nothing without the length of the list it came from.
    const sizeRows = await query<{ source: string; scraped_at: string; n: number }>(
        `SELECT source, scraped_at, COUNT(*) AS n FROM rankings
          WHERE rank_overall IS NOT NULL AND rank_overall < 999
          GROUP BY source, scraped_at`);
    const sizes = new Map(sizeRows.map(r => [`${r.source}|${r.scraped_at}`, Number(r.n)]));

    const sourceRanks = new Map<string, Map<number, DatedRank>>();
    for (const r of rows) {
        let m = sourceRanks.get(r.source);
        if (!m) { m = new Map(); sourceRanks.set(r.source, m); }
        m.set(r.player_id, { rank: r.rank_overall, day: r.scraped_at });
    }
    const pool = new Map((await query<{ id: number; position: string | null }>(
        `SELECT id, position FROM players WHERE redraft_pool = 1`))
        .map(p => [p.id, (p.position || '').toUpperCase()] as const));

    const out = buildConsensus(sourceRanks, pool, sizes);
    for (let i = 0; i < out.length; i += 200) {
        const chunk = out.slice(i, i + 200);
        const params: (number | string)[] = [];
        const values = chunk.map(c => {
            const b = params.length;
            params.push(c.player_id, 'REDRAFT', c.rank_overall, c.rank_positional,
                c.avg_rank, c.best_rank, c.worst_rank, c.std_deviation,
                c.num_sources, today);
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},`
                 + `$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
        });
        await getDb().prepare(
            `INSERT INTO consensus_rankings
               (player_id, format, rank_overall, rank_positional, avg_rank,
                best_rank, worst_rank, std_deviation, num_sources, calculated_at)
             VALUES ${values.join(',')}
             ON CONFLICT (player_id, format, calculated_at) DO UPDATE SET
               rank_overall    = excluded.rank_overall,
               rank_positional = excluded.rank_positional,
               avg_rank        = excluded.avg_rank,
               best_rank       = excluded.best_rank,
               worst_rank      = excluded.worst_rank,
               std_deviation   = excluded.std_deviation,
               num_sources     = excluded.num_sources`,
        ).run(params);
    }
    return out.length;
}


export interface SourceRefreshResult {
    status: 'ok' | 'failed';
    scraped_at: string;
    pool: number;
    consensus: unknown;
    rows?: Record<string, unknown[]>;
    [key: string]: unknown;
}

/** Refresh the three sources, then rebuild the consensus over all ten. */
export async function refreshRankingSources(
    today: string, withRows = false,
): Promise<SourceRefreshResult> {
    const pool = await query<PoolPlayer>(
        `SELECT id, full_name, position, nfl_team, sleeper_id, espn_nfl_id, fantasypros_id
           FROM players WHERE redraft_pool = 1`,
    );
    const m = new Matcher(pool);

    const jobs: [string, string, string, () => Promise<Entry[]>][] = [
        ['fantasypros', SOURCES.fantasypros.source, SOURCES.fantasypros.url, () => fetchFantasyPros(m)],
        ['fantasycalc', SOURCES.fantasycalc.source, SOURCES.fantasycalc.url, () => fetchFantasyCalc(m)],
        ['ktc', SOURCES.ktc.source, SOURCES.ktc.url, () => fetchKtc(m)],
        ['sleeper', SOURCES.sleeper.source, SOURCES.sleeper.url, () => fetchSleeper(m)],
        ['espn', SOURCES.espn.source, SOURCES.espn.url, () => fetchEspn(m)],
        ['cbs', SOURCES.cbs.source, SOURCES.cbs.url, () => fetchCbs(m)],
    ];

    // One source failing must not cost the others their refresh.
    const settled = await Promise.allSettled(jobs.map(async ([, source, url, run]) => {
        const entries = await run();
        return { source, rows: await save(source, url, entries, today) };
    }));

    const report: Record<string, unknown> = {};
    const rows: Record<string, unknown[]> = {};
    settled.forEach((r, i) => {
        const [key] = jobs[i];
        if (r.status === 'fulfilled') {
            report[key] = { source: r.value.source, saved: r.value.rows.length };
            if (withRows) {
                rows[r.value.source] = r.value.rows.map(x =>
                    [x.pid, x.overall, x.positional, x.tier, x.raw]);
            }
        } else {
            report[key] = { error: String((r.reason as Error)?.message ?? r.reason) };
        }
    });

    // Rebuild over every source's newest ranks, not just the three above — a
    // refresh that moved one source still changes the order. This runs even
    // when all three scrapes failed: it is idempotent, and it keeps the
    // consensus consistent with whatever `rankings` actually holds.
    let consensus: unknown;
    try {
        consensus = { written: await rebuildConsensus(today) };
    } catch (e) {
        consensus = { error: String((e as Error)?.message ?? e) };
    }

    return {
        status: settled.some(r => r.status === 'fulfilled') ? 'ok' : 'failed',
        scraped_at: today,
        pool: pool.length,
        ...report,
        consensus,
        // [player_id, rank_overall, rank_positional, tier, value]
        ...(withRows ? { rows } : {}),
    };
}
