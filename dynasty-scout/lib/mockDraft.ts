/**
 * Mock draft engine.
 *
 * Pure functions only — no React, no DOM — so the pick logic can be reasoned
 * about (and driven headlessly) on its own. The UI in components/redraft/mock
 * owns all the state; this file just answers "who is on the clock" and "who
 * would this team take".
 */
import { RedraftPlayer } from '@/lib/types';

// ── Sources ──────────────────────────────────────────────────────────────────

export type RankSourceKey =
    | 'consensus' | 'mine'
    | 'fp_rank' | 'espn_rank' | 'flock_rank' | 'cbs_rank' | 'sleeper_rank'
    | 'yahoo_rank' | 'underdog_rank' | 'ffpc_rank' | 'ktc_rank' | 'fc_rank';

/**
 * Every ordering the app offers. Shared by the draft board's "Order by" select
 * and the mock draft, so the two can't drift.
 */
export const RANK_SOURCES: { key: RankSourceKey; label: string }[] = [
    { key: 'consensus', label: 'Consensus' },
    { key: 'mine', label: 'My Tiers' },
    { key: 'fp_rank', label: 'FantasyPros' },
    { key: 'espn_rank', label: 'ESPN' },
    { key: 'flock_rank', label: 'Flock' },
    { key: 'cbs_rank', label: 'CBS' },
    { key: 'sleeper_rank', label: 'Sleeper ADP' },
    { key: 'yahoo_rank', label: 'Yahoo' },
    { key: 'underdog_rank', label: 'Underdog' },
    { key: 'ffpc_rank', label: 'FFPC' },
    { key: 'ktc_rank', label: 'KeepTradeCut' },
    { key: 'fc_rank', label: 'FantasyCalc' },
];

/** Sources an AI team can be assigned (My Tiers needs the user's own data). */
export const AI_SOURCES = RANK_SOURCES.filter(s => s.key !== 'mine');

export function sourceLabel(key: RankSourceKey): string {
    return RANK_SOURCES.find(s => s.key === key)?.label ?? String(key);
}

// ── Roster shape ─────────────────────────────────────────────────────────────

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'DST' | 'K';
export const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];

/** Positions the FLEX slot accepts. */
export const FLEX_POSITIONS: Pos[] = ['RB', 'WR', 'TE'];

export interface RosterSlots {
    QB: number; RB: number; WR: number; TE: number;
    FLEX: number; DST: number; K: number; BN: number;
}

/** The setup the user asked for: PPR, 1QB/2RB/2WR/1TE/1FLX/1DST/1K + 5 bench. */
export const DEFAULT_ROSTER: RosterSlots = {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 5,
};

/** Caps stop a source's quirks producing a team with five quarterbacks. */
export const DEFAULT_POSITION_LIMITS: Record<Pos, number> = {
    QB: 3, RB: 8, WR: 8, TE: 3, DST: 2, K: 2,
};

export interface MockSettings {
    teams: number;
    /** 1-based draft slot the human occupies. */
    mySlot: number;
    snake: boolean;
    /** 0 = no clock. */
    secondsPerPick: number;
    roster: RosterSlots;
    positionLimits: Record<Pos, number>;
    /** One source per team; index 0 is team 1. */
    teamSources: RankSourceKey[];
    /** 0 = strict rank order, 100 = frequent reaches. */
    randomness: number;
}

export interface MockPick {
    overall: number;
    round: number;
    pickInRound: number;
    teamIndex: number;
    playerId: number;
    /** True when the clock ran out and the pick was made for the user. */
    auto: boolean;
}

export interface MockState {
    settings: MockSettings;
    picks: MockPick[];
    status: 'active' | 'complete';
    startedAt: number;
}

export function totalRounds(roster: RosterSlots): number {
    return roster.QB + roster.RB + roster.WR + roster.TE
        + roster.FLEX + roster.DST + roster.K + roster.BN;
}

export function totalPicks(settings: MockSettings): number {
    return totalRounds(settings.roster) * settings.teams;
}

export function defaultSettings(teams = 12, mySlot = 1): MockSettings {
    return {
        teams,
        mySlot,
        snake: true,
        secondsPerPick: 60,
        roster: { ...DEFAULT_ROSTER },
        positionLimits: { ...DEFAULT_POSITION_LIMITS },
        // Spread the available sources around the room by default — that is the
        // whole point of the feature, and it beats every opponent using one list.
        teamSources: Array.from({ length: teams },
            (_, i) => AI_SOURCES[i % AI_SOURCES.length].key),
        randomness: 35,
    };
}

// ── Draft order ──────────────────────────────────────────────────────────────

/** 0-based index of the team on the clock for a 1-based overall pick. */
export function teamOnClock(overall: number, teams: number, snake: boolean): number {
    const round = Math.ceil(overall / teams);
    const idx = (overall - 1) % teams;
    return !snake || round % 2 === 1 ? idx : teams - 1 - idx;
}

export function roundOf(overall: number, teams: number): number {
    return Math.ceil(overall / teams);
}

export function pickInRoundOf(overall: number, teams: number): number {
    return ((overall - 1) % teams) + 1;
}

/** Overall numbers of a team's remaining picks, soonest first. */
export function upcomingPicksFor(
    teamIndex: number, fromOverall: number, settings: MockSettings,
): number[] {
    const out: number[] = [];
    const last = totalPicks(settings);
    for (let o = fromOverall; o <= last; o++) {
        if (teamOnClock(o, settings.teams, settings.snake) === teamIndex) out.push(o);
    }
    return out;
}

// ── Roster state ─────────────────────────────────────────────────────────────

export type PositionCounts = Record<Pos, number>;

export function emptyCounts(): PositionCounts {
    return { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 };
}

export function countsFor(playerIds: number[], byId: Map<number, RedraftPlayer>): PositionCounts {
    const c = emptyCounts();
    for (const id of playerIds) {
        const pos = (byId.get(id)?.position || '').toUpperCase() as Pos;
        if (pos in c) c[pos] += 1;
    }
    return c;
}

/**
 * How many starter slots of each position are still unfilled, treating FLEX as
 * shared across RB/WR/TE. Used both to nudge the AI and to guarantee that every
 * roster ends up legal.
 */
export function unfilledStarters(counts: PositionCounts, roster: RosterSlots): Record<Pos, number> {
    const need = emptyCounts();
    let flexLeft = roster.FLEX;
    for (const pos of POSITIONS) {
        const dedicated = (roster as any)[pos] as number ?? 0;
        const have = counts[pos];
        need[pos] = Math.max(0, dedicated - have);
        // Anything past the dedicated slots can absorb a FLEX opening.
        if (FLEX_POSITIONS.includes(pos)) {
            const spare = Math.max(0, have - dedicated);
            flexLeft = Math.max(0, flexLeft - spare);
        }
    }
    // A remaining FLEX opening counts as need against every eligible position.
    if (flexLeft > 0) {
        for (const pos of FLEX_POSITIONS) need[pos] += flexLeft;
    }
    return need;
}

/** Starter slots still to fill, counting FLEX once rather than per position. */
export function starterSlotsRemaining(counts: PositionCounts, roster: RosterSlots): number {
    let remaining = 0;
    let flexPool = 0;
    for (const pos of POSITIONS) {
        const dedicated = (roster as any)[pos] as number ?? 0;
        remaining += Math.max(0, dedicated - counts[pos]);
        if (FLEX_POSITIONS.includes(pos)) flexPool += Math.max(0, counts[pos] - dedicated);
    }
    remaining += Math.max(0, roster.FLEX - flexPool);
    return remaining;
}

export interface EligibilityCtx {
    counts: PositionCounts;
    settings: MockSettings;
    round: number;
    picksMade: number;
}

/**
 * Whether taking this position right now would leave a legal roster.
 *
 * Two things can rule a position out: the team is already at its limit there,
 * or the picks remaining have fallen to the starter slots remaining, in which
 * case only positions that fill a starter are allowed.
 *
 * This is the rule the human's board is gated on, so it contains nothing but
 * legality — reaching for a kicker in round 4 is unusual, not illegal, and the
 * app has no business greying it out.
 */
export function canDraft(pos: Pos, ctx: EligibilityCtx): boolean {
    const { counts, settings, picksMade } = ctx;
    const rounds = totalRounds(settings.roster);

    if (picksMade >= rounds) return false;
    if (counts[pos] >= (settings.positionLimits[pos] ?? 99)) return false;

    const picksLeft = rounds - picksMade;
    const mustFill = starterSlotsRemaining(counts, settings.roster);
    if (picksLeft <= mustFill) {
        // Only positions that actually reduce the starter deficit.
        const need = unfilledStarters(counts, settings.roster);
        if (!need[pos]) return false;
    }
    return true;
}

/**
 * What a pick made *for* someone will consider — the AI teams, and the
 * autopick when a clock runs out.
 *
 * Legality plus one realism rule: K and D/ST stay off the board until the last
 * two rounds. Kickers rank from ~206 in our consensus, so without this a source
 * would happily take one in round 6 and the mock would stop resembling a real
 * draft. It is a heuristic about how drafts actually go, which is why it steers
 * the computer's picks and never blocks the user's.
 */
export function canAutoDraft(pos: Pos, ctx: EligibilityCtx): boolean {
    if (!canDraft(pos, ctx)) return false;
    const rounds = totalRounds(ctx.settings.roster);
    if ((pos === 'K' || pos === 'DST') && ctx.round <= rounds - 2) return false;
    return true;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

/**
 * A player's rank under one source. `consensus` uses the board order the server
 * already computed; `mine` uses the tier-derived map when one is supplied.
 */
export function rankUnder(
    p: RedraftPlayer, source: RankSourceKey, myRanks?: Map<number, number>,
): number | null {
    if (source === 'consensus') return p.board_rank ?? p.rank_overall ?? null;
    if (source === 'mine') return myRanks?.get(p.id) ?? null;
    const v = p[source as keyof RedraftPlayer];
    return typeof v === 'number' ? v : null;
}

/** Sort by a source, players the source didn't rank always last. */
export function sortBySource(
    players: RedraftPlayer[], source: RankSourceKey, myRanks?: Map<number, number>,
): RedraftPlayer[] {
    const original = new Map(players.map((p, i) => [p.id, i]));
    return [...players].sort((a, b) => {
        const av = rankUnder(a, source, myRanks);
        const bv = rankUnder(b, source, myRanks);
        if (av == null && bv == null) return original.get(a.id)! - original.get(b.id)!;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av - bv || original.get(a.id)! - original.get(b.id)!;
    });
}

/** Rank places a position is pulled up when it still owes a starter. */
const NEED_BONUS = 8;

/**
 * Deterministic PRNG so a randomness of 0 replays identically and any given
 * draft can be reproduced from its seed.
 */
export function makeRng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

/**
 * The player an AI team takes.
 *
 * Ranks by that team's source, nudges positions that still owe a starter, then
 * picks from a small window at the top. The window is 1 wide at randomness 0
 * (strict best-available) and widens with the slider, weighted so the top of
 * the window is still the likeliest choice.
 */
export function aiPick(
    available: RedraftPlayer[],
    source: RankSourceKey,
    ctx: EligibilityCtx,
    rng: () => number,
    myRanks?: Map<number, number>,
): RedraftPlayer | null {
    const need = unfilledStarters(ctx.counts, ctx.settings.roster);
    const eligible = available.filter(p =>
        canAutoDraft((p.position || '').toUpperCase() as Pos, ctx));
    if (eligible.length === 0) return null;

    const scored = eligible
        .map(p => {
            const pos = (p.position || '').toUpperCase() as Pos;
            const raw = rankUnder(p, source, myRanks);
            // Unranked players sit behind everyone this source did rank.
            const base = raw ?? 10_000 + (p.board_rank ?? 0);
            return { p, score: base - (need[pos] ? NEED_BONUS : 0) };
        })
        .sort((a, b) => a.score - b.score);

    const window = 1 + Math.round((ctx.settings.randomness / 100) * 6);
    const size = Math.min(window, scored.length);
    // Square the draw so the top of the window stays the likeliest pick.
    const idx = Math.floor(rng() * rng() * size);
    return scored[Math.min(idx, size - 1)].p;
}

// ── Persistence ──────────────────────────────────────────────────────────────

export const MOCK_STORAGE_KEY = 'redraft_mock_state';

export function saveMock(state: MockState): void {
    try {
        localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
    } catch { /* private mode / quota — the draft still works in memory */ }
}

export function loadMock(): MockState | null {
    try {
        const raw = localStorage.getItem(MOCK_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as MockState;
        if (!parsed?.settings || !Array.isArray(parsed.picks)) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function clearMock(): void {
    try { localStorage.removeItem(MOCK_STORAGE_KEY); } catch { /* ignore */ }
}
