'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import { POSITION_RAW } from '@/lib/constants';
import {
    BAND_LABEL, DEFENCE_POSITIONS, matchupScore, rankBand,
    type DefenceCell, type DefencePosition,
} from '@/lib/defence';

/**
 * What the defence across the line is good and bad at.
 *
 * "Points allowed to running backs" is the number every site prints and on
 * its own it decides nothing, because it does not say *how*. Seattle last
 * season gave up the fewest yards a carry in the league and the most catches
 * to backs: run at them and you are wasting a flex, throw at them and you
 * have found one. A manager choosing between a between-the-tackles back and
 * a receiving back needs that second sentence, and one aggregate number
 * destroys it.
 *
 * So every measure is shown separately and each is placed against the league
 * rather than left as a bare figure — a reader deciding on a Sunday morning
 * does not have the average yards a catch memorised, and should not need to.
 *
 * Colour is from the reader's side of the ball: a generous defence is a good
 * thing to be facing. The diverging pair is the same one used everywhere
 * else for "better or worse than the middle", so it carries no new meaning
 * to learn.
 */

/** Measures where conceding more is worse for the defence, not better. */
const DEFENCE_WINS = new Set(['interceptions']);

function Bar({ value, avg, span, invert }: {
    value: number; avg: number; span: number; invert: boolean;
}) {
    const off = span > 0 ? Math.max(-1, Math.min(1, (value - avg) / span)) : 0;
    const w = Math.abs(off) * 50;
    // Right of the line means more conceded. Good for the reader except on
    // the measures where the defence taking the ball away is the point.
    const helpful = invert ? off < 0 : off > 0;
    return (
        <span className="relative block w-full h-[6px]">
            <span className="absolute inset-0 rounded"
                style={{ background: CHART_INK.grid }} />
            <span className="absolute" style={{
                left: '50%', top: -2, bottom: -2, width: 1,
                background: 'rgba(255,255,255,0.28)',
            }} />
            <span className="absolute" style={{
                top: 0, height: 6,
                left: off >= 0 ? '50%' : `${50 - w}%`,
                width: `${w}%`, minWidth: Math.abs(off) > 0.005 ? 2 : 0,
                background: helpful ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: MARK.barRadius,
            }} />
        </span>
    );
}

/** A rank, said the way a reader would say it. */
function rankWords(rank: number, of: number, invert: boolean) {
    // Rank 1 is the most conceded. On an interception count that is the
    // league's most generous defence too, so the wording does not flip —
    // only the colour does, because giving the ball away is the offence's
    // problem rather than the defence's gift.
    const place = invert ? of + 1 - rank : rank;
    return { place, of, band: rankBand(place, of) };
}

export function DefenceProfile({ cells, of, defense, position, loading }: {
    cells: DefenceCell[];
    of: number;
    /** The defence being faced. */
    defense: string | null;
    /** The player's position, which gets the detail. */
    position: string | null;
    loading?: boolean;
}) {
    const pos = (position ?? '').toUpperCase() as DefencePosition;
    const mine = cells.find(c => c.defense === defense && c.position === pos);
    const theirs = DEFENCE_POSITIONS
        .map(p => cells.find(c => c.defense === defense && c.position === p))
        .filter((c): c is DefenceCell => !!c);

    if (!defense) {
        return (
            <p className="text-[11px] text-muted-foreground/45">
                No opponent this week, so there is no defence to read.
            </p>
        );
    }
    if (loading && theirs.length === 0) {
        return (
            <p className="text-[11px] text-muted-foreground/45">
                Reading what {defense} gives up…
            </p>
        );
    }
    if (theirs.length === 0) {
        return (
            <p className="text-[11px] text-muted-foreground/45">
                No games logged against {defense}, so there is nothing to say about
                them yet — which is different from saying they are average.
            </p>
        );
    }

    // One scale per measure, fitted to how far the league actually spreads on
    // it. Fixed spans would make a tight measure look flat and clip a wide
    // one, and the two sit in the same column.
    const spanFor = (key: string, p: DefencePosition) => {
        const xs = cells.filter(c => c.position === p)
            .map(c => c.stats.find(s => s.key === key)?.value)
            .filter((v): v is number => v != null);
        if (xs.length === 0) return 0;
        const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.max(...xs.map(v => Math.abs(v - avg))) || 1;
    };
    const pointsSpan = (p: DefencePosition) => {
        const xs = cells.filter(c => c.position === p).map(c => c.points);
        const avg = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
        return Math.max(...xs.map(v => Math.abs(v - avg))) || 1;
    };

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1.5">
                {/* Not "What WAS gives up", which a reader parses as a verb
                    before they parse it as Washington. */}
                <h4 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    The {defense} defence · what they give up
                </h4>
                <span className="text-[9px] text-muted-foreground/35">
                    per game · {theirs[0].games} games, {theirs[0].season} ·
                    {' '}right of the line is generous
                </span>
            </div>

            {/* Every position first, because the useful question is often
                not "is this a good matchup" but "which of my two is it a
                good matchup for". */}
            <ul className="space-y-0.5 mb-2">
                {theirs.map(c => {
                    const w = rankWords(c.pointsRank, of, false);
                    const isMine = c.position === pos;
                    return (
                        <li key={c.position}
                            className={cn(`grid items-center gap-x-2 rounded px-1 py-[3px]
                                           grid-cols-[30px_minmax(0,1fr)_auto]
                                           sm:grid-cols-[30px_54px_minmax(0,1fr)_128px]`,
                                isMine && 'bg-white/[0.05]')}
                            title={`${c.defense} concede ${c.points} fantasy points a game `
                                + `to ${c.position}s, against a league average of `
                                + `${c.pointsLeagueAvg}`}>
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: POSITION_RAW[c.position]
                                        ?? '#64748b' }} />
                                <span className={cn('text-[10px]',
                                    isMine ? 'font-bold text-foreground'
                                        : 'font-bold text-muted-foreground/60')}>
                                    {c.position}
                                </span>
                            </span>
                            <span className="hidden sm:block text-[10px] tabular-nums
                                             text-muted-foreground/60">
                                {c.points} pts
                            </span>
                            <Bar value={c.points} avg={c.pointsLeagueAvg}
                                span={pointsSpan(c.position)} invert={false} />
                            <span className="text-[9px] text-muted-foreground/50
                                             whitespace-nowrap text-right sm:text-left">
                                {BAND_LABEL[w.band]} · {w.place} of {w.of}
                            </span>
                        </li>
                    );
                })}
            </ul>

            {/* And then how the points happen, for the player in hand. A
                defence conceding twenty-two to backs on twenty-eight carries
                is a different problem from one conceding twenty-two on
                eighteen carries and six catches. */}
            {mine && (
                <>
                    <p className="text-[9px] uppercase tracking-widest font-bold
                                  text-muted-foreground/40 mb-1">
                        How they give it up to {mine.position}s
                    </p>
                    <ul className="space-y-0.5">
                        {mine.stats.map(s => {
                            const invert = DEFENCE_WINS.has(s.key);
                            const w = rankWords(s.rank, of, invert);
                            return (
                                <li key={s.key}
                                    className="grid items-center gap-x-2
                                               grid-cols-[minmax(0,1fr)_auto]
                                               sm:grid-cols-[104px_54px_minmax(0,1fr)_112px]"
                                    title={`${s.value} a game against a league average of `
                                        + `${s.leagueAvg}`}>
                                    <span className="text-[10px] text-muted-foreground/55
                                                     truncate">
                                        {s.label}
                                    </span>
                                    <span className="hidden sm:block text-[10px] tabular-nums
                                                     font-semibold text-right">
                                        {s.value.toFixed(s.dp)}
                                    </span>
                                    <span className="hidden sm:block">
                                        <Bar value={s.value} avg={s.leagueAvg}
                                            span={spanFor(s.key, mine.position)}
                                            invert={invert} />
                                    </span>
                                    <span className="text-[9px] text-muted-foreground/45
                                                     tabular-nums text-right sm:text-left
                                                     whitespace-nowrap">
                                        <span className="sm:hidden font-semibold
                                                         text-muted-foreground/70">
                                            {s.value.toFixed(s.dp)}{' · '}
                                        </span>
                                        {w.place} of {w.of}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-[9px] text-muted-foreground/35 mt-1.5 leading-snug">
                        Ranked most generous first, per team-game — what this defence
                        concedes on a Sunday, not what one opposing player averages
                        against it. Interceptions are ranked the other way round, since
                        taking the ball away is not a gift.
                    </p>
                </>
            )}
        </div>
    );
}

/**
 * The matchup, small enough to sit beside a name on a lineup row.
 *
 * One number so a reader can scan nine slots without reading nine
 * paragraphs, and the paragraph one click away under the row rather than
 * gone. The word beside it does most of the work — "soft" is what a reader
 * takes away, and the digit is there for the two rows that are close.
 */
export function MatchupChip({ cells, of, defense, position, className }: {
    cells: DefenceCell[];
    of: number;
    defense: string | null;
    position: string | null;
    className?: string;
}) {
    const pos = (position ?? '').toUpperCase();
    const cell = cells.find(c => c.defense === defense && c.position === pos);
    if (!defense) {
        return (
            <span className={cn('text-[9px] text-muted-foreground/35', className)}>
                on a bye
            </span>
        );
    }
    if (!cell) return null;
    const score = matchupScore(cell.pointsRank, of);
    const band = rankBand(cell.pointsRank, of);
    // The same diverging pair as everywhere else: right of the middle is
    // good for the reader. A neutral grey in the middle, because a fifth of
    // the league is genuinely average and colouring it either way overstates.
    const ink = band === 'soft' || band === 'leaky' ? DIVERGING.positive
        : band === 'firm' || band === 'tough' ? DIVERGING.negative
        : 'rgba(255,255,255,0.45)';
    const WORD: Record<typeof band, string> = {
        soft: 'soft', leaky: 'leaky', middling: 'average',
        firm: 'firm', tough: 'tough',
    };
    return (
        <span className={cn('text-[9px] whitespace-nowrap', className)}
            title={`${defense} are ${cell.pointsRank} of ${of} most generous to `
                + `${pos}s — ${cell.points} fantasy points a game against a league `
                + `average of ${cell.pointsLeagueAvg}, over ${cell.games} games in `
                + `${cell.season}. Ten is the softest defence in the league against `
                + `this position, nought the hardest.`}>
            <span className="text-muted-foreground/40">vs {defense} </span>
            <span className="font-bold tabular-nums" style={{ color: ink }}>
                {score.toFixed(1)}
            </span>
            <span className="text-muted-foreground/40"> {WORD[band]}</span>
        </span>
    );
}
