'use client';

import React from 'react';
import { VegasGameLine, VegasTeamSeason } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
    team: string | null;
    season: number;
    teamSeason: VegasTeamSeason | null;
    /** Every scheduled game for the player's team, in week order. */
    schedule: VegasGameLine[];
    /** Logo per team abbreviation, for the opponent column. */
    logos: Record<string, string>;
}

// Implied team totals live in a narrow band — roughly 16 to 30 points — so
// fixed thresholds read more honestly here than a percentile would: 27 is a
// good spot to be regardless of how the rest of the league is priced.
function totalTone(implied: number): { text: string; bar: string } {
    if (implied >= 26) return { text: 'text-emerald-300', bar: 'bg-emerald-400' };
    if (implied >= 24) return { text: 'text-green-300', bar: 'bg-green-400' };
    if (implied >= 22) return { text: 'text-yellow-300', bar: 'bg-yellow-400' };
    if (implied >= 20) return { text: 'text-orange-300', bar: 'bg-orange-400' };
    return { text: 'text-red-300', bar: 'bg-red-400' };
}

function fmt(v: number | null | undefined, digits = 1): string {
    return v == null ? '—' : v.toFixed(digits);
}

function spreadStr(v: number | null): string {
    if (v == null) return '—';
    return v > 0 ? `+${v}` : `${v}`;
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function VegasPanel({ team, season, teamSeason, schedule, logos }: Props) {
    if (!team) {
        return (
            <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                No NFL team — a free agent has no game environment to price.
            </div>
        );
    }
    if (!teamSeason || !teamSeason.games_lined) {
        return (
            <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                No {season} lines posted for {team} yet. Books price the season a few
                weeks at a time, so this fills in as the schedule approaches.
            </div>
        );
    }

    const lined = schedule.filter(g => g.implied_team_total != null);
    const impliedTone = totalTone(teamSeason.avg_implied_total ?? 0);
    // The one week between the first and last game with no fixture is the bye,
    // and in redraft that is a roster decision, so it belongs in the table.
    const weeks = new Set(schedule.map(g => g.week));
    const lastWeek = schedule.length ? Math.max(...weeks) : 0;
    const byeWeek = schedule.length
        ? Array.from({ length: lastWeek }, (_, i) => i + 1).find(w => !weeks.has(w)) ?? null
        : null;
    const rows: (VegasGameLine | { bye: number })[] = [...schedule];
    if (byeWeek != null) {
        rows.splice(schedule.findIndex(g => g.week > byeWeek), 0, { bye: byeWeek });
    }

    const kpis = [
        {
            label: 'Implied Team Total',
            value: fmt(teamSeason.avg_implied_total),
            sub: teamSeason.implied_total_rank
                ? `${ordinal(teamSeason.implied_total_rank)} of 32`
                : undefined,
            tone: impliedTone.text,
        },
        {
            label: 'Game Total',
            value: fmt(teamSeason.avg_total),
            sub: teamSeason.total_rank ? `${ordinal(teamSeason.total_rank)} of 32` : undefined,
        },
        {
            label: 'Average Spread',
            value: spreadStr(teamSeason.avg_spread),
            sub: (teamSeason.avg_spread ?? 0) < 0 ? 'favoured' : 'underdog',
        },
        {
            label: 'Expected Win Rate',
            value: teamSeason.win_pct != null ? `${(teamSeason.win_pct * 100).toFixed(0)}%` : '—',
            sub: `${teamSeason.exp_wins_lined?.toFixed(1) ?? '—'} wins in ${teamSeason.games_lined} priced`,
        },
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {kpis.map(k => (
                    <div key={k.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-semibold">
                            {k.label}
                        </div>
                        <div className={cn(
                            'text-xl font-bold font-[var(--font-jetbrains),monospace] leading-tight mt-0.5',
                            k.tone,
                        )}>
                            {k.value}
                        </div>
                        {k.sub && <div className="text-[10px] text-muted-foreground/70">{k.sub}</div>}
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border border-white/[0.05] overflow-x-auto" style={{ background: 'var(--bg-card)' }}>
                <table className="w-full text-[12px] min-w-[520px]">
                    <thead>
                        <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
                            <th className="text-left font-bold px-3 py-2.5">Wk</th>
                            <th className="text-left font-bold px-2">Opponent</th>
                            <th className="text-center font-bold px-2" title="Point spread — negative means favoured">Spread</th>
                            <th className="text-center font-bold px-2" title="Total points the market expects in the game">Total</th>
                            <th className="text-center font-bold px-2" title="Half the total, shifted by half the spread">Implied</th>
                            <th className="text-left font-bold px-2" title="De-vigged moneyline win probability">Win %</th>
                        </tr>
                    </thead>
                    <tbody className="font-[var(--font-jetbrains),monospace]">
                        {rows.map(row => {
                            if ('bye' in row) {
                                return (
                                    <tr key="bye" className="border-b border-white/[0.03] bg-white/[0.015]">
                                        <td className="px-3 py-2 font-bold text-muted-foreground/60">{row.bye}</td>
                                        <td colSpan={5} className="px-2 text-muted-foreground/50 italic">
                                            Bye week
                                        </td>
                                    </tr>
                                );
                            }
                            const g = row;
                            const tone = g.implied_team_total != null
                                ? totalTone(g.implied_team_total)
                                : null;
                            return (
                                <tr key={g.game_id}
                                    className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                                    <td className="px-3 py-2 font-bold">{g.week}</td>
                                    <td className="px-2">
                                        <span className="flex items-center gap-1.5">
                                            <span className="text-muted-foreground/50 w-3">
                                                {g.is_home ? 'vs' : '@'}
                                            </span>
                                            {logos[g.opponent] && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={logos[g.opponent]} alt="" className="w-4 h-4 object-contain" />
                                            )}
                                            <span>{g.opponent}</span>
                                        </span>
                                    </td>
                                    <td className="text-center px-2">{spreadStr(g.spread)}</td>
                                    <td className="text-center px-2 text-muted-foreground">
                                        {fmt(g.total_line)}
                                    </td>
                                    <td className={cn('text-center px-2 font-bold', tone?.text)}>
                                        {fmt(g.implied_team_total)}
                                    </td>
                                    <td className="px-2">
                                        {g.win_prob != null ? (
                                            <span className="flex items-center gap-2">
                                                <span className="h-1.5 w-14 rounded-full bg-white/10 overflow-hidden">
                                                    <span className={cn('block h-full rounded-full', tone?.bar ?? 'bg-white/30')}
                                                        style={{ width: `${Math.round(g.win_prob * 100)}%` }} />
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {Math.round(g.win_prob * 100)}%
                                                </span>
                                            </span>
                                        ) : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
                Lines are the market’s current price for each game, from nflverse. A team’s
                implied total is half the game total shifted by half the spread — it is the
                number every projection is built on, because points have to exist before
                anyone can score them. Win probabilities are de-vigged from both moneylines.
                {lined.length < schedule.length && (
                    <> Only {lined.length} of {schedule.length} games are priced so far.</>
                )}
            </p>
        </div>
    );
}
