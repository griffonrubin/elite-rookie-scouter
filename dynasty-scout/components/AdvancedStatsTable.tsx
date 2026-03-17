import { CollegeStats } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
    stats: CollegeStats[];
    position: string;
}

const fmt1 = (v: number | null | undefined) => v != null ? v.toFixed(1) : '—';
const fmt2 = (v: number | null | undefined) => v != null ? v.toFixed(2) : '—';
const fmtInt = (v: number | null | undefined) => v != null ? String(Math.round(v)) : '—';
const fmtPct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—';

function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
    if (a == null || b == null || b === 0) return null;
    return a / b;
}

export function AdvancedStatsTable({ stats, position }: Props) {
    if (!stats || stats.length === 0) return null;

    const isWR = position === 'WR';
    const isTE = position === 'TE';
    const isRB = position === 'RB';
    const isQB = position === 'QB';
    const isReceiver = isWR || isTE;

    // Career totals
    const career = stats.reduce((acc, s) => ({
        gp:         acc.gp + (s.games_played ?? 0),
        routes:     acc.routes + (s.routes_run ?? 0),
        targets:    acc.targets + (s.targets ?? 0),
        receptions: acc.receptions + (s.receptions ?? 0),
        rec_yards:  acc.rec_yards + (s.rec_yards ?? 0),
        rec_tds:    acc.rec_tds + (s.rec_tds ?? 0),
        yac:        acc.yac + (s.yards_after_catch ?? 0),
        air_yards:  acc.air_yards + (s.air_yards ?? 0),
        mtf:        acc.mtf + (s.missed_tackles_forced ?? 0),
        first_downs: acc.first_downs + (s.first_downs ?? 0),
        rush_att:   acc.rush_att + (s.rush_attempts ?? 0),
        rush_yards: acc.rush_yards + (s.rush_yards ?? 0),
        rush_tds:   acc.rush_tds + (s.rush_tds ?? 0),
        yac_cont:   acc.yac_cont + (s.yards_after_contact ?? 0),
        pass_att:   acc.pass_att + (s.pass_attempts ?? 0),
        completions: acc.completions + (s.completions ?? 0),
        pass_yards: acc.pass_yards + (s.pass_yards ?? 0),
        pass_tds:   acc.pass_tds + (s.pass_tds ?? 0),
        ints:       acc.ints + (s.interceptions ?? 0),
        rush_yards_qb: acc.rush_yards_qb + (s.rush_yards ?? 0),
        rush_att_qb:   acc.rush_att_qb + (s.rush_attempts ?? 0),
    }), {
        gp: 0, routes: 0, targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0, yac: 0,
        air_yards: 0, mtf: 0, first_downs: 0, rush_att: 0, rush_yards: 0, rush_tds: 0,
        yac_cont: 0, pass_att: 0, completions: 0, pass_yards: 0, pass_tds: 0, ints: 0,
        rush_yards_qb: 0, rush_att_qb: 0,
    });

    const thClass = 'text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-2 whitespace-nowrap';
    const tdClass = 'text-right text-[11px] font-mono py-1.5 px-2 whitespace-nowrap';
    const tdMuted = cn(tdClass, 'text-muted-foreground/60');

    if (isReceiver) {
        return (
            <div className="rounded-lg border border-border/40 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-border/30 bg-muted/20">
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-3 whitespace-nowrap">Yr</th>
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-2 whitespace-nowrap">School</th>
                            <th className={thClass}>GP</th>
                            <th className={thClass}>Routes</th>
                            <th className={thClass}>Tgts</th>
                            <th className={thClass}>Rec</th>
                            <th className={thClass}>Yds</th>
                            <th className={thClass}>YPRR</th>
                            <th className={thClass}>RPRR</th>
                            <th className={thClass}>YAC/Rec</th>
                            <th className={thClass}>ADOT</th>
                            <th className={thClass}>Drop%</th>
                            <th className={thClass}>MTF</th>
                            <th className={thClass}>TDs</th>
                            <th className={thClass}>YPG</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {stats.map(s => {
                            const rprr = safeDiv(s.receptions, s.routes_run);
                            const yacRec = safeDiv(s.yards_after_catch, s.receptions);
                            const adot = s.adot ?? safeDiv(s.air_yards, s.targets);
                            const ypg = safeDiv(s.rec_yards, s.games_played);
                            return (
                                <tr key={`${s.season}-${s.school}`} className="hover:bg-white/[0.02]">
                                    <td className="text-left text-[11px] font-medium py-1.5 px-3">{s.season}</td>
                                    <td className="text-left text-[11px] text-muted-foreground py-1.5 px-2 max-w-[90px] truncate">{s.school}</td>
                                    <td className={tdMuted}>{fmtInt(s.games_played)}</td>
                                    <td className={tdClass}>{fmtInt(s.routes_run)}</td>
                                    <td className={tdClass}>{fmtInt(s.targets)}</td>
                                    <td className={tdClass}>{fmtInt(s.receptions)}</td>
                                    <td className={cn(tdClass, 'text-primary/80')}>{fmtInt(s.rec_yards)}</td>
                                    <td className={cn(tdClass, s.yprr != null && s.yprr >= 2.5 ? 'text-emerald-400' : '')}>{fmt2(s.yprr)}</td>
                                    <td className={tdMuted}>{fmt2(rprr)}</td>
                                    <td className={tdMuted}>{fmt1(yacRec)}</td>
                                    <td className={tdMuted}>{fmt1(adot)}</td>
                                    <td className={tdMuted}>{fmtPct(s.drop_rate)}</td>
                                    <td className={tdMuted}>{fmtInt(s.missed_tackles_forced)}</td>
                                    <td className={tdClass}>{fmtInt(s.rec_tds)}</td>
                                    <td className={tdMuted}>{fmt1(ypg)}</td>
                                </tr>
                            );
                        })}
                        {stats.length > 1 && (
                            <tr className="bg-muted/40 font-bold border-t border-border/40">
                                <td className="text-left text-[11px] font-black py-1.5 px-3">CAREER</td>
                                <td className="py-1.5 px-2 text-muted-foreground text-[11px]">—</td>
                                <td className={tdMuted}>{career.gp}</td>
                                <td className={tdClass}>{career.routes > 0 ? career.routes : '—'}</td>
                                <td className={tdClass}>{career.targets > 0 ? career.targets : '—'}</td>
                                <td className={tdClass}>{career.receptions}</td>
                                <td className={cn(tdClass, 'text-primary/80')}>{career.rec_yards}</td>
                                <td className={cn(tdClass, safeDiv(career.rec_yards, career.routes) != null && safeDiv(career.rec_yards, career.routes)! >= 2.5 ? 'text-emerald-400' : '')}>{fmt2(safeDiv(career.rec_yards, career.routes))}</td>
                                <td className={tdMuted}>{fmt2(safeDiv(career.receptions, career.routes))}</td>
                                <td className={tdMuted}>{fmt1(safeDiv(career.yac, career.receptions))}</td>
                                <td className={tdMuted}>{fmt1(safeDiv(career.air_yards, career.targets))}</td>
                                <td className={tdMuted}>—</td>
                                <td className={tdMuted}>{career.mtf > 0 ? career.mtf : '—'}</td>
                                <td className={tdClass}>{career.rec_tds}</td>
                                <td className={tdMuted}>{fmt1(safeDiv(career.rec_yards, career.gp))}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    }

    if (isRB) {
        return (
            <div className="rounded-lg border border-border/40 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-border/30 bg-muted/20">
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-3 whitespace-nowrap">Yr</th>
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-2 whitespace-nowrap">School</th>
                            <th className={thClass}>GP</th>
                            <th className={thClass}>Att</th>
                            <th className={thClass}>Rush Yds</th>
                            <th className={thClass}>YPC</th>
                            <th className={thClass}>YAC/Att</th>
                            <th className={thClass}>Break%</th>
                            <th className={thClass}>MTF</th>
                            <th className={thClass}>Rec</th>
                            <th className={thClass}>Rec Yds</th>
                            <th className={thClass}>Scrim Yds</th>
                            <th className={thClass}>Scrim/G</th>
                            <th className={thClass}>TDs</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {stats.map(s => {
                            const yacAtt = safeDiv(s.yards_after_contact, s.rush_attempts);
                            const scrim = (s.rush_yards ?? 0) + (s.rec_yards ?? 0);
                            const scrimG = safeDiv(scrim, s.games_played);
                            const tds = (s.rush_tds ?? 0) + (s.rec_tds ?? 0);
                            return (
                                <tr key={`${s.season}-${s.school}`} className="hover:bg-white/[0.02]">
                                    <td className="text-left text-[11px] font-medium py-1.5 px-3">{s.season}</td>
                                    <td className="text-left text-[11px] text-muted-foreground py-1.5 px-2 max-w-[90px] truncate">{s.school}</td>
                                    <td className={tdMuted}>{fmtInt(s.games_played)}</td>
                                    <td className={tdClass}>{fmtInt(s.rush_attempts)}</td>
                                    <td className={cn(tdClass, 'text-primary/80')}>{fmtInt(s.rush_yards)}</td>
                                    <td className={tdClass}>{fmt2(s.yards_per_carry)}</td>
                                    <td className={tdMuted}>{fmt2(yacAtt)}</td>
                                    <td className={tdMuted}>{fmtPct(s.breakaway_run_rate)}</td>
                                    <td className={tdMuted}>{fmtInt(s.missed_tackles_forced)}</td>
                                    <td className={tdClass}>{fmtInt(s.receptions)}</td>
                                    <td className={tdClass}>{fmtInt(s.rec_yards)}</td>
                                    <td className={cn(tdClass, 'text-primary/80')}>{fmtInt(scrim)}</td>
                                    <td className={tdMuted}>{fmt1(scrimG)}</td>
                                    <td className={tdClass}>{fmtInt(tds)}</td>
                                </tr>
                            );
                        })}
                        {stats.length > 1 && (
                            <tr className="bg-muted/40 font-bold border-t border-border/40">
                                <td className="text-left text-[11px] font-black py-1.5 px-3">CAREER</td>
                                <td className="py-1.5 px-2 text-muted-foreground text-[11px]">—</td>
                                <td className={tdMuted}>{career.gp}</td>
                                <td className={tdClass}>{career.rush_att}</td>
                                <td className={cn(tdClass, 'text-primary/80')}>{career.rush_yards}</td>
                                <td className={tdClass}>{fmt2(safeDiv(career.rush_yards, career.rush_att))}</td>
                                <td className={tdMuted}>{fmt2(safeDiv(career.yac_cont, career.rush_att))}</td>
                                <td className={tdMuted}>—</td>
                                <td className={tdMuted}>{career.mtf > 0 ? career.mtf : '—'}</td>
                                <td className={tdClass}>{career.receptions}</td>
                                <td className={tdClass}>{career.rec_yards}</td>
                                <td className={cn(tdClass, 'text-primary/80')}>{career.rush_yards + career.rec_yards}</td>
                                <td className={tdMuted}>{fmt1(safeDiv(career.rush_yards + career.rec_yards, career.gp))}</td>
                                <td className={tdClass}>{career.rush_tds + career.rec_tds}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    }

    if (isQB) {
        return (
            <div className="rounded-lg border border-border/40 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-border/30 bg-muted/20">
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-3 whitespace-nowrap">Yr</th>
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 py-1.5 px-2 whitespace-nowrap">School</th>
                            <th className={thClass}>GP</th>
                            <th className={thClass}>Cmp/Att</th>
                            <th className={thClass}>Cmp%</th>
                            <th className={thClass}>Pass Yds</th>
                            <th className={thClass}>YPA</th>
                            <th className={thClass}>TD</th>
                            <th className={thClass}>INT</th>
                            <th className={thClass}>QBR</th>
                            <th className={thClass}>EPA/play</th>
                            <th className={thClass}>Rush Att</th>
                            <th className={thClass}>Rush Yds</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {stats.map(s => (
                            <tr key={`${s.season}-${s.school}`} className="hover:bg-white/[0.02]">
                                <td className="text-left text-[11px] font-medium py-1.5 px-3">{s.season}</td>
                                <td className="text-left text-[11px] text-muted-foreground py-1.5 px-2 max-w-[90px] truncate">{s.school}</td>
                                <td className={tdMuted}>{fmtInt(s.games_played)}</td>
                                <td className={tdClass}>{s.pass_attempts ? `${s.completions ?? 0}/${s.pass_attempts}` : '—'}</td>
                                <td className={tdMuted}>{fmtPct(s.completion_pct != null ? s.completion_pct / 100 : safeDiv(s.completions, s.pass_attempts))}</td>
                                <td className={cn(tdClass, 'text-primary/80')}>{fmtInt(s.pass_yards)}</td>
                                <td className={tdClass}>{fmt1(s.yards_per_attempt)}</td>
                                <td className={tdClass}>{fmtInt(s.pass_tds)}</td>
                                <td className={tdMuted}>{fmtInt(s.interceptions)}</td>
                                <td className={tdMuted}>{fmt1(s.qbr)}</td>
                                <td className={tdMuted}>{s.epa_per_play != null ? (s.epa_per_play >= 0 ? '+' : '') + fmt2(s.epa_per_play) : '—'}</td>
                                <td className={tdMuted}>{fmtInt(s.rush_attempts)}</td>
                                <td className={tdClass}>{fmtInt(s.rush_yards)}</td>
                            </tr>
                        ))}
                        {stats.length > 1 && (
                            <tr className="bg-muted/40 font-bold border-t border-border/40">
                                <td className="text-left text-[11px] font-black py-1.5 px-3">CAREER</td>
                                <td className="py-1.5 px-2 text-muted-foreground text-[11px]">—</td>
                                <td className={tdMuted}>{career.gp}</td>
                                <td className={tdClass}>{career.pass_att > 0 ? `${career.completions}/${career.pass_att}` : '—'}</td>
                                <td className={tdMuted}>{fmtPct(safeDiv(career.completions, career.pass_att))}</td>
                                <td className={cn(tdClass, 'text-primary/80')}>{career.pass_yards}</td>
                                <td className={tdClass}>{fmt1(safeDiv(career.pass_yards, career.pass_att))}</td>
                                <td className={tdClass}>{career.pass_tds}</td>
                                <td className={tdMuted}>{career.ints}</td>
                                <td className={tdMuted}>—</td>
                                <td className={tdMuted}>—</td>
                                <td className={tdMuted}>{career.rush_att_qb > 0 ? career.rush_att_qb : '—'}</td>
                                <td className={tdClass}>{career.rush_yards_qb > 0 ? career.rush_yards_qb : '—'}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    }

    return null;
}
