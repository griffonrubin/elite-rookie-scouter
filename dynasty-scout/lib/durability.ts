/**
 * How often a player is actually there, and how that compares.
 *
 * A profile page can show three seasons of production in full and never once
 * say that one of them was ten games rather than seventeen. That is not a
 * detail — availability is the largest single input to what a player is worth
 * over a season, and it is the one thing every projection quietly assumes
 * away by pricing a full year.
 *
 * The count comes from the same arithmetic the successor measurement uses:
 * weeks his team played, minus the weeks he appeared, after his first
 * appearance for them. A bye is not a missed game because his team did not
 * play one; a week before he arrived is not a missed game because he was
 * somewhere else.
 *
 * The raw number is close to useless on its own. "Missed seven" means one
 * thing for a running back and another for a kicker, and a reader cannot
 * hold thirty positional baselines in their head — so it is stated against
 * the position, which is the only comparison that makes it a judgement
 * rather than a fact.
 */

export interface Attendance {
    playerId: number;
    position: string | null;
    played: number;
    missed: number;
}

export interface Durability {
    played: number;
    missed: number;
    /** Share of his team's games he has missed. */
    rate: number;
    /**
     * Where that sits among men at his position, as a percentile.
     *
     * A hundred means nobody missed fewer; zero means nobody missed more.
     * Null when there are too few comparable men to rank against, which is
     * honest and happens at kicker in a short window.
     */
    percentile: number | null;
    /** How many peers the percentile is against. */
    peers: number;
    /**
     * And what the middle of them looks like, as a rate rather than a count.
     *
     * It has to be the same quantity the percentile ranks on or the two
     * disagree in front of the reader. Bucky Irving missed seven and the
     * median back missed five, which reads as worse than average — and he
     * sits at the fifty-first percentile, because he was there for
     * thirty-four team games and a man who was on a roster for seventeen
     * can miss five out of far fewer. Ranking on the count instead would
     * punish availability itself, so the count stays as the fact and the
     * comparison is rate to rate.
     */
    medianRate: number | null;
}

/**
 * How many games before an attendance rate means anything.
 *
 * Eight, which is about half a season. Below that a single absence swings
 * the rate by more than the difference between the most and least durable
 * players in the league, and ranking on it would mostly be ranking on who
 * arrived late.
 */
export const MIN_ATTENDANCE_GAMES = 8;

const median = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function durabilityOf(me: Attendance, all: Attendance[]): Durability {
    const total = me.played + me.missed;
    const rate = total > 0 ? me.missed / total : 0;

    const pos = (me.position ?? '').toUpperCase();
    const peers = all.filter(a =>
        a.playerId !== me.playerId
        && (a.position ?? '').toUpperCase() === pos
        && a.played + a.missed >= MIN_ATTENDANCE_GAMES);

    if (total < MIN_ATTENDANCE_GAMES || peers.length < 10) {
        return {
            played: me.played, missed: me.missed, rate,
            percentile: null, peers: peers.length,
            medianRate: median(peers.map(p => p.missed / (p.played + p.missed))),
        };
    }

    /**
     * Ties share the middle of their run rather than the top of it.
     *
     * Missing nothing is common — a third of receivers manage it — and
     * counting "strictly worse than me" alone would put every one of them at
     * the same percentile as the single most durable man in the league,
     * which reads as a distinction none of them has earned. Half the tie is
     * the usual correction and the one that keeps the median at fifty.
     */
    const rateOf = (a: Attendance) => a.missed / (a.played + a.missed);
    let worse = 0, same = 0;
    for (const p of peers) {
        const r = rateOf(p);
        if (r > rate) worse++;
        else if (r === rate) same++;
    }
    const percentile = ((worse + same / 2) / peers.length) * 100;

    return {
        played: me.played, missed: me.missed, rate,
        percentile, peers: peers.length,
        medianRate: median(peers.map(rateOf)),
    };
}
