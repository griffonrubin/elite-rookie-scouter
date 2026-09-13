'use client';

import React from 'react';
import { Outcome } from '@/lib/startSit';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';

/**
 * What moved this projection, itemised.
 *
 * The page was handing down a number and a verdict. "Breece Hall 13.3, Set"
 * is an answer, and an answer is not a tool: a reader who cannot see which
 * input produced it cannot disagree with one of them. You might know the
 * beat writer expects a committee this week, or think the books are slow to
 * a weather line — neither is usable against a single figure.
 *
 * So the arithmetic is on the page. The player's own level, then each thing
 * about this particular week that moved it, signed, on one zero line. The
 * parts add to the mean by construction, which is what makes this an audit
 * rather than an illustration.
 *
 * Diverging, because these are signed quantities around zero: two hues and a
 * neutral, never a ramp and never a hue at the midpoint. Every bar carries
 * its own signed number, so the colour is the second encoding rather than
 * the only one.
 */

export interface WhyBarsProps {
    outcome: Outcome;
    /**
     * What he has actually averaged lately, from the log.
     *
     * Needed to catch the case the model cannot see on its own: in week 1
     * the form weight is zero, so the centre is entirely a projection made
     * in August — which is the right default for an established player and
     * badly wrong for one whose role has changed since. The waiver page is
     * full of them.
     */
    recentMean?: number | null;
    recentGames?: number | null;
    /** For naming the matchup and the game in words rather than in points. */
    context?: {
        opponent?: string | null;
        impliedTeamTotal?: number | null;
        spread?: number | null;
        defenseAllowed?: number | null;
        defenseLeagueAvg?: number | null;
        defenseSample?: number | null;
        position?: string | null;
    };
}

interface Driver {
    key: string;
    label: string;
    points: number;
    /** The evidence, in its own units — what a reader would argue with. */
    detail: string;
}

function driversOf({ outcome: o, context: c = {} }: WhyBarsProps): Driver[] {
    const d = o.drivers;
    if (o.centreSource === 'market') {
        return [{
            key: 'market', label: 'Prop market', points: d.market,
            detail: 'The betting line priced this player directly, so it '
                + 'replaces the model rather than adding to it — the line '
                + 'already contains the total, the script and the defence.',
        }];
    }
    const out: Driver[] = [];
    if (d.teamTotal !== 0) {
        const t = c.impliedTeamTotal;
        out.push({
            key: 'total', label: 'Team total', points: d.teamTotal,
            detail: t != null
                ? `The books expect this offence to score ${t}, against a `
                  + `league-neutral 22.5.`
                : 'How many points the books expect this offence to score.',
        });
    }
    if (d.script !== 0) {
        const s = c.spread;
        const pos = c.position ?? 'this position';
        // Name the mechanism in the direction it actually runs for this
        // player. "Cuts each way by position" is true and useless: a reader
        // looking at a receiver losing four tenths on a three-point lead
        // wants to know that a team in front throws less, so they can decide
        // whether they believe this particular offence will do that.
        const ahead = s != null && s < 0;
        const why = d.script < 0
            ? (ahead
                ? `a team in front runs more and throws less late, which costs a ${pos}`
                : `a team behind abandons the run, which costs a ${pos}`)
            : (ahead
                ? `a team in front leans on the run, which a ${pos} gains from`
                : `a team behind throws to catch up, which a ${pos} gains from`);
        out.push({
            key: 'script', label: 'Game script', points: d.script,
            detail: s != null
                ? `${ahead ? `Favoured by ${Math.abs(s)}` : `Underdog by ${s}`} — `
                  + `${why}.`
                : 'The run/pass balance the spread implies.',
        });
    }
    if (d.matchup !== 0) {
        const { defenseAllowed: a, defenseLeagueAvg: lg, defenseSample: n } = c;
        // Stated as a ratio, which is the only way it means anything.
        //
        // The raw figure is an average over every player at the position who
        // faced this defence, third-stringers with two touches included, so it
        // lands near 8 for a running back. Printed as "allows 8.0 to RBs" next
        // to a 17.3 projection it reads as a contradiction, and the model
        // never uses it as a level anyway — only as this defence against the
        // league. So lead with that, and keep the raw pair as the evidence
        // behind it, labelled for what it actually counts.
        const pos = c.position ?? 'the position';
        const pct = a != null && lg != null && lg > 0
            ? Math.round(((a / lg) - 1) * 100) : null;
        out.push({
            key: 'matchup', label: 'Matchup', points: d.matchup,
            detail: pct != null
                ? `${c.opponent ?? 'This defence'} gives up `
                  + (pct === 0 ? 'about the league average'
                      : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than average`)
                  + ` to ${pos}s — ${a!.toFixed(1)} against ${lg!.toFixed(1)} per `
                  + `${pos} faced${n ? `, over ${n} games` : ''}.`
                : 'What this defence gives up to the position.',
        });
    }
    return out;
}

export function WhyBars(props: WhyBarsProps) {
    const { outcome: o } = props;
    const drivers = driversOf(props);
    const base = o.drivers.base;

    // One scale for every bar, so a +1.4 is visibly bigger than a +0.9. The
    // floor keeps a lineup of near-zero drivers from rendering as noise at
    // full width.
    const span = Math.max(1.5, ...drivers.map(d => Math.abs(d.points)));

    // Three bars for four tenths of a point is a chart arguing with itself.
    // Under half a point of context across everything, the honest reading is
    // that this week does not move the number — one line, not a figure.
    const netContext = drivers.reduce((t, d) => t + d.points, 0);
    const trivial = drivers.length > 0 && Math.abs(netContext) < 0.5
        && drivers.every(d => Math.abs(d.points) < 0.5);

    if (o.onBye) {
        return (
            <p className="text-[11px] text-muted-foreground/55">
                On bye — no game to project.
            </p>
        );
    }

    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    What moved it
                </h4>
                <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                    {base.toFixed(1)} base
                    {drivers.length > 0 && ' · '}
                    {drivers.length > 0 && `${o.mean.toFixed(1)} expected`}
                </span>
            </div>

            <BaseSplit outcome={o} recentMean={props.recentMean}
                recentGames={props.recentGames} />

            {trivial ? (
                <p className="text-[11px] text-muted-foreground/55 leading-snug">
                    Barely anything this week: the total, the spread and the defence
                    come to{' '}
                    <span className="tabular-nums font-semibold text-muted-foreground/75">
                        {netContext >= 0 ? '+' : ''}{netContext.toFixed(1)}
                    </span>{' '}
                    between them. {base.toFixed(1)} is this player&rsquo;s own level,
                    and that is the number to argue with.
                    <span className="block mt-1 text-[10px] text-muted-foreground/40">
                        {drivers.map(d => d.detail).join(' ')}
                    </span>
                </p>
            ) : drivers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/55">
                    Nothing about this week moves the number: a neutral total,
                    an even spread and an average defence. {base.toFixed(1)} is
                    this player&rsquo;s own level.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {drivers.map(d => {
                        const up = d.points > 0;
                        const frac = Math.min(1, Math.abs(d.points) / span);
                        return (
                            <li key={d.key} className="space-y-0.5">
                                <div className="grid items-center gap-x-2
                                                grid-cols-[76px_180px_38px]">
                                    <span className="text-[11px] text-muted-foreground/65 truncate">
                                        {d.label}
                                    </span>
                                    {/* A capped track, because the bar compares
                                        these three with each other and is not
                                        a use of whatever width the panel has.
                                        Left to stretch, a two-tenths nudge drew
                                        a bar the width of a column and read as
                                        a crisis. */}
                                    <span className="relative h-[5px] block">
                                        <span className="absolute inset-y-[-2px] left-1/2 w-px"
                                            style={{ background: CHART_INK.axis }} />
                                        <span className="absolute top-0 bottom-0"
                                            style={{
                                                background: up
                                                    ? DIVERGING.positive
                                                    : DIVERGING.negative,
                                                left: up ? '50%' : `${50 - frac * 50}%`,
                                                width: `${Math.max(frac * 50, 1)}%`,
                                                borderRadius: MARK.barRadius,
                                            }} />
                                    </span>
                                    <span className="text-[11px] font-semibold tabular-nums
                                                     text-right"
                                        style={{ color: up ? '#93C5FD' : '#FCA5A5' }}>
                                        {up ? '+' : ''}{d.points.toFixed(1)}
                                    </span>
                                </div>
                                {/* The evidence under its own bar rather than
                                    in a block below all of them: a bar says how
                                    much and never says why, and the why is the
                                    part you argue with. */}
                                <p className="text-[10px] text-muted-foreground/50
                                              leading-snug pl-[76px] pr-1 max-w-[440px]">
                                    {d.detail}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            {o.playProbability < 1 && (
                <p className="text-[10px] leading-snug" style={{ color: '#FDBA74' }}>
                    <span className="font-semibold">
                        {o.availability ?? 'Injury report'}:
                    </span>{' '}
                    <span className="text-muted-foreground/60">
                        everything above assumes he plays. The simulation sits him
                        in {Math.round((1 - o.playProbability) * 100)}% of weeks, which
                        is why the floor is lower than the range suggests.
                    </span>
                </p>
            )}
        </div>
    );
}

/**
 * Where the base itself came from.
 *
 * Everything else here is context applied to a level, and the level is not a
 * fact either — it is a blend of what somebody projected in August and what
 * the player has actually done since, mixed by games played. That mixing is
 * the most contestable choice in the model and the one a reader is most
 * likely to have a view on: four good games into a season, is he a 17-point
 * back now, or a 13-point back who has had four good games?
 *
 * Stated, it is a judgement anyone can overrule. Hidden, it is the model
 * deciding quietly and presenting the result as arithmetic.
 */
function BaseSplit({ outcome: o, recentMean, recentGames }: {
    outcome: Outcome; recentMean?: number | null; recentGames?: number | null;
}) {
    const { projectionPerGame: proj, formMean: form } = o.drivers;
    const w = o.formWeight;

    // Only one of the two, or neither, means there is no blend to explain.
    if (proj == null || form == null) {
        const only = proj ?? form;
        if (only == null) return null;
        /**
         * A projection that disagrees sharply with the recent log.
         *
         * This used to be framed as the projection being wrong, and told the
         * reader to prefer the log. Measured over two seasons that advice is
         * backwards: a five-game average predicts the next week *worse* than
         * a season average does, and worst of all for exactly these players
         * — the ones whose recent games look nothing like their season are
         * the ones where chasing the recent games costs two whole points of
         * error. A hot finish is mostly variance.
         *
         * So the disagreement is still worth flagging, because it is real
         * and the reader should know the blend has nothing to correct it
         * with. What it points at is the usage, which is the half of "read
         * the usage and the log" that survived the measurement: a snap share
         * up ten points predicts a man beating his own average, where a
         * five-game points surge predicts nothing.
         *
         * scripts/formweight_check.mts is the measurement.
         */
        const stale = proj != null && recentMean != null && (recentGames ?? 0) >= 4
            && recentMean > Math.max(proj * 1.6, proj + 4);
        return (
            <p className="text-[10px] leading-snug"
                style={{ color: stale ? '#FDBA74' : undefined }}>
                <span className={stale ? '' : 'text-muted-foreground/45'}>
                    {proj != null
                        ? `${only.toFixed(1)} a game from the preseason projection — `
                          + 'no games logged this season yet to weigh against it.'
                        : `${only.toFixed(1)} a game from his own logs; no preseason `
                          + 'projection to blend with.'}
                </span>
                {stale && (
                    <span className="text-muted-foreground/60">
                        {' '}His last {recentGames} games average{' '}
                        <span className="font-semibold">{recentMean!.toFixed(1)}</span>,
                        which is a long way from it — and with no games this season
                        there is nothing in the blend to settle the argument. Worth
                        knowing, but not worth taking the recent games over the
                        projection on: across two seasons a five-game average
                        predicts the next week worse than a full one does, and
                        worst of all for players who look like this. The usage is
                        the part that carries, so read that.
                    </span>
                )}
            </p>
        );
    }

    const pct = Math.round(w * 100);
    return (
        <p className="text-[10px] text-muted-foreground/45 leading-snug">
            <span className="font-semibold text-muted-foreground/65">Base:</span>{' '}
            <span className="tabular-nums">{pct}%</span> what he has done this
            season (<span className="tabular-nums">{form.toFixed(1)}</span> a game),{' '}
            <span className="tabular-nums">{100 - pct}%</span> the preseason
            projection (<span className="tabular-nums">{proj.toFixed(1)}</span>).
            {' '}The weight moves with games played, so early in a year the
            projection still carries most of it.
        </p>
    );
}
