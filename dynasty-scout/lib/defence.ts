/**
 * What a defence is good and bad at.
 *
 * "Points allowed to running backs" is the standard matchup number and on
 * its own it is close to useless for a decision, because it does not say
 * *how*. A defence that concedes twenty-two to backs on twenty-eight
 * carries is a different problem from one that concedes twenty-two on
 * eighteen carries and six catches, and a manager choosing between a
 * between-the-tackles back and a receiving back needs the second sentence,
 * not the first.
 *
 * So each defence is described per position by what it gives up in a game —
 * the volume, the efficiency and the scores separately — and every number is
 * ranked across the league so a reader never has to know what an average is
 * to know whether a number is high.
 *
 * Measured per *team*-game rather than per player-game, which is the fix
 * this file exists for. Averaging over player-games divides by how many
 * players a defence happened to face, so a defence that keeps meeting
 * committee backfields looks stingy against backs while conceding exactly as
 * much: the two orderings disagree by up to eleven places across the league.
 * What a defence gives up on a Sunday is a team-game.
 */

export const DEFENCE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type DefencePosition = (typeof DEFENCE_POSITIONS)[number];

/**
 * Current-season games before a defence is read on this year rather than
 * last.
 *
 * Four is the least that is a sample at all, and the alternative is worse
 * than a small sample: a defence that has rebuilt its secondary is not last
 * September's defence, and week five is late to still be saying it is.
 */
export const MIN_CURRENT_GAMES = 4;

export interface DefenceStat {
    key: string;
    /** What it is, in words a reader does not have to decode. */
    label: string;
    /** Per game conceded to this position. */
    value: number;
    /** What the average defence concedes. */
    leagueAvg: number;
    /**
     * 1 is the most generous defence in the league on this measure.
     *
     * Generosity first, because the reader is looking for somewhere to
     * attack. Stated in the UI rather than assumed.
     */
    rank: number;
    /** Decimal places worth showing. */
    dp: number;
}

export interface DefenceCell {
    defense: string;
    position: DefencePosition;
    /** Which season these games came from, so the page can say. */
    season: number;
    games: number;
    /** Fantasy points conceded to the position per game, and its rank. */
    points: number;
    pointsLeagueAvg: number;
    pointsRank: number;
    /** How the points happen. */
    stats: DefenceStat[];
}

/** Every raw per-game total, before ranking. */
export interface DefenceTotals {
    defense: string;
    position: DefencePosition;
    season: number;
    games: number;
    points: number;
    carries: number;
    rushYards: number;
    rushTds: number;
    targets: number;
    receptions: number;
    recYards: number;
    recTds: number;
    passAttempts: number;
    passYards: number;
    passTds: number;
    interceptions: number;
}

const per = (a: number, b: number) => (b > 0 ? a / b : 0);

/**
 * Which numbers are worth showing for each position.
 *
 * Volume, then efficiency, then scores — because that is the order the
 * question gets asked in. A defence giving up a lot of catches to tight ends
 * is a different recommendation from one giving up a lot of yards per catch,
 * and only the first travels to a tight end who runs eight routes a game.
 */
function statsFor(t: DefenceTotals): Omit<DefenceStat, 'leagueAvg' | 'rank'>[] {
    switch (t.position) {
        case 'QB':
            return [
                { key: 'passYards', label: 'pass yards', value: t.passYards, dp: 0 },
                { key: 'passTds', label: 'pass TDs', value: t.passTds, dp: 2 },
                { key: 'ypa', label: 'yards a throw',
                    value: per(t.passYards, t.passAttempts), dp: 1 },
                // Sign kept as-is and the label does the work: a defence
                // that takes the ball away is stingy, and ranking it first
                // for generosity would be backwards. The UI reads the rank
                // off `interceptions` inverted for that reason.
                { key: 'interceptions', label: 'interceptions', value: t.interceptions, dp: 2 },
                { key: 'rushYards', label: 'QB rush yards', value: t.rushYards, dp: 0 },
            ];
        case 'RB':
            return [
                { key: 'carries', label: 'carries', value: t.carries, dp: 1 },
                { key: 'ypc', label: 'yards a carry',
                    value: per(t.rushYards, t.carries), dp: 2 },
                { key: 'rushYards', label: 'rush yards', value: t.rushYards, dp: 0 },
                { key: 'rushTds', label: 'rush TDs', value: t.rushTds, dp: 2 },
                { key: 'receptions', label: 'catches', value: t.receptions, dp: 1 },
                { key: 'recYards', label: 'receiving yards', value: t.recYards, dp: 0 },
            ];
        default:
            return [
                { key: 'targets', label: 'targets', value: t.targets, dp: 1 },
                { key: 'receptions', label: 'catches', value: t.receptions, dp: 1 },
                { key: 'recYards', label: 'receiving yards', value: t.recYards, dp: 0 },
                { key: 'ypr', label: 'yards a catch',
                    value: per(t.recYards, t.receptions), dp: 1 },
                { key: 'recTds', label: 'receiving TDs', value: t.recTds, dp: 2 },
            ];
    }
}

/**
 * Rank every defence against the league, position by position.
 *
 * Ranked rather than left as raw numbers because "twenty-two points to
 * backs" requires knowing what an average is, and a reader deciding between
 * two flex plays on a Sunday morning does not have that memorised. "Third
 * most generous of thirty-two" needs nothing.
 */
export function rankDefences(totals: DefenceTotals[]): DefenceCell[] {
    const out: DefenceCell[] = [];
    for (const position of DEFENCE_POSITIONS) {
        const rows = totals.filter(t => t.position === position);
        if (rows.length === 0) continue;
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
        const pointsAvg = mean(rows.map(r => r.points));
        // Descending: most conceded is rank 1, which is the best place to
        // attack. Ties share the lower number rather than being ordered by
        // whatever the database happened to return first.
        const rankOf = (xs: { defense: string; v: number }[]) => {
            const sorted = [...xs].sort((a, b) => b.v - a.v);
            const m = new Map<string, number>();
            sorted.forEach((x, i) => {
                const first = sorted.findIndex(y => y.v === x.v);
                m.set(x.defense, first + 1);
            });
            return m;
        };
        const pointsRank = rankOf(rows.map(r => ({ defense: r.defense, v: r.points })));
        const statRows = rows.map(r => ({ t: r, stats: statsFor(r) }));
        const keys = statRows[0]?.stats.map(s => s.key) ?? [];
        const byKey = new Map<string, { avg: number; rank: Map<string, number> }>();
        for (const key of keys) {
            const vs = statRows.map(r => ({
                defense: r.t.defense,
                v: r.stats.find(s => s.key === key)?.value ?? 0,
            }));
            byKey.set(key, { avg: mean(vs.map(v => v.v)), rank: rankOf(vs) });
        }
        for (const r of statRows) {
            out.push({
                defense: r.t.defense,
                position,
                season: r.t.season,
                games: r.t.games,
                points: Math.round(r.t.points * 10) / 10,
                pointsLeagueAvg: Math.round(pointsAvg * 10) / 10,
                pointsRank: pointsRank.get(r.t.defense) ?? 0,
                stats: r.stats.map(s => {
                    const k = byKey.get(s.key)!;
                    return {
                        ...s,
                        value: Math.round(s.value * 100) / 100,
                        leagueAvg: Math.round(k.avg * 100) / 100,
                        rank: k.rank.get(r.t.defense) ?? 0,
                    };
                }),
            });
        }
    }
    return out;
}

/**
 * Where a number sits, said in words.
 *
 * A rank is precise and a phrase is readable, and a page that only gives the
 * rank makes every reader do the same division in their head. Bands rather
 * than a gradient, because "eleventh of thirty-two" and "twelfth" are not
 * different findings.
 */
export function rankBand(rank: number, of: number): 'soft' | 'leaky' | 'middling'
    | 'firm' | 'tough' {
    const q = (rank - 0.5) / of;
    if (q < 0.16) return 'soft';
    if (q < 0.34) return 'leaky';
    if (q < 0.66) return 'middling';
    if (q < 0.84) return 'firm';
    return 'tough';
}

export const BAND_LABEL: Record<ReturnType<typeof rankBand>, string> = {
    soft: 'gives this up',
    leaky: 'leaks here',
    middling: 'average here',
    firm: 'holds up',
    tough: 'shuts this down',
};

/**
 * A defence matchup as one number, nought to ten.
 *
 * Deliberately *only* the defence, and labelled as only the defence. The
 * temptation is to fold in the game total and the spread and print a single
 * "startability score", which is what the sites that popularised these do —
 * and that number cannot be checked, cannot be argued with, and cannot be
 * decomposed by the reader. It also cannot be calibrated honestly, because a
 * combined index has no natural scale.
 *
 * A league rank has one. Ten is the softest defence in the league against
 * this position and nought is the hardest, and every point in between is a
 * place in a table a reader can go and look at. The game environment is
 * already on the same row as the implied team total and broken out in full
 * under "what moved it", where it can be read rather than trusted.
 */
export function matchupScore(rank: number, of: number): number {
    if (!Number.isFinite(rank) || of < 2) return 5;
    const s = (10 * (of - rank)) / (of - 1);
    return Math.round(Math.max(0, Math.min(10, s)) * 10) / 10;
}
