import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { CollegeStats } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatsTableProps {
    stats: CollegeStats[];
    position: string;
}

/** Compute best (max) value across seasons for a given extractor. Returns the season index (or -1). */
function bestIdx(stats: CollegeStats[], extract: (s: CollegeStats) => number | null): number {
    let bestI = -1;
    let bestV = -Infinity;
    stats.forEach((s, i) => {
        const v = extract(s);
        if (v != null && v > bestV) { bestV = v; bestI = i; }
    });
    // Only highlight if >1 season and value > 0
    return stats.length > 1 && bestV > 0 ? bestI : -1;
}

/** Best season cell highlight — subtle gold underline */
const BEST = "text-yellow-300 font-extrabold";

export function StatsTable({ stats, position }: StatsTableProps) {
    const isQB = position === 'QB';
    const isRB = position === 'RB';
    const isWR = position === 'WR';
    const isTE = position === 'TE';

    // Pre-compute best season indices
    const bests = {
        gp:        bestIdx(stats, s => s.games_played ?? 0),
        passYds:   bestIdx(stats, s => s.pass_yards ?? 0),
        passTds:   bestIdx(stats, s => s.pass_tds ?? 0),
        ypa:       bestIdx(stats, s => s.pass_attempts ? (s.pass_yards || 0) / s.pass_attempts : 0),
        compPct:   bestIdx(stats, s => s.pass_attempts ? (s.completions || 0) / s.pass_attempts : 0),
        rushYds:   bestIdx(stats, s => s.rush_yards ?? 0),
        rushTds:   bestIdx(stats, s => s.rush_tds ?? 0),
        ypc:       bestIdx(stats, s => s.rush_attempts ? (s.rush_yards || 0) / s.rush_attempts : 0),
        rec:       bestIdx(stats, s => s.receptions ?? 0),
        recYds:    bestIdx(stats, s => s.rec_yards ?? 0),
        recTds:    bestIdx(stats, s => s.rec_tds ?? 0),
        ypr:       bestIdx(stats, s => s.receptions ? (s.rec_yards || 0) / s.receptions : 0),
        scrimYpg:  bestIdx(stats, s => s.games_played ? ((s.rush_yards || 0) + (s.rec_yards || 0)) / s.games_played : 0),
        tgtG:      bestIdx(stats, s => s.games_played && (s.targets || s.receptions) ? (s.targets || s.receptions || 0) / s.games_played : 0),
    };

    function isBest(key: keyof typeof bests, idx: number): string {
        return bests[key] === idx ? BEST : '';
    }

    return (
        <div className="rounded-xl border border-border/40 overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Year</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead className="text-right">GP</TableHead>

                        {isQB && (
                            <>
                                <TableHead className="text-right">Cmp/Att</TableHead>
                                <TableHead className="text-right">Yards</TableHead>
                                <TableHead className="text-right">TD</TableHead>
                                <TableHead className="text-right">INT</TableHead>
                                <TableHead className="text-right">YPA</TableHead>
                            </>
                        )}

                        <TableHead className="text-right">Rush</TableHead>
                        <TableHead className="text-right">Ru.Yds</TableHead>
                        <TableHead className="text-right">YPC</TableHead>
                        <TableHead className="text-right">Ru.TD</TableHead>

                        {(isRB || isWR || isTE) && (
                            <>
                                <TableHead className="text-right">Rec</TableHead>
                                <TableHead className="text-right">Yds</TableHead>
                                <TableHead className="text-right">YPR</TableHead>
                                <TableHead className="text-right">TD</TableHead>
                                {(isWR || isTE) && <TableHead className="text-right">YAC</TableHead>}
                            </>
                        )}

                        {isQB ? (
                            <TableHead className="text-right">Cmp%</TableHead>
                        ) : (isWR || isTE) ? (
                            <TableHead className="text-right">TGT/G</TableHead>
                        ) : isRB ? (
                            <TableHead className="text-right">Scrim Yds/G</TableHead>
                        ) : (
                            <TableHead className="text-right">Dom%</TableHead>
                        )}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {stats.map((season, si) => (
                        <TableRow key={`${season.season}-${season.school}`}>
                            <TableCell className="font-medium">{season.season}</TableCell>
                            <TableCell>{season.school}</TableCell>
                            <TableCell className={cn("text-right", isBest('gp', si))}>{season.games_played ?? '—'}</TableCell>

                            {isQB && (
                                <>
                                    <TableCell className="text-right">{season.pass_attempts ? `${season.completions}/${season.pass_attempts}` : '—'}</TableCell>
                                    <TableCell className={cn("text-right", isBest('passYds', si))}>{season.pass_yards || '—'}</TableCell>
                                    <TableCell className={cn("text-right", isBest('passTds', si))}>{season.pass_tds ?? '—'}</TableCell>
                                    <TableCell className="text-right">{season.interceptions ?? '—'}</TableCell>
                                    <TableCell className={cn("text-right", isBest('ypa', si) || (() => {
                                        if (!season.pass_attempts) return "";
                                        const ypa = (season.pass_yards || 0) / season.pass_attempts;
                                        if (ypa >= 9.0) return "text-emerald-400 font-bold";
                                        if (ypa >= 7.5) return "text-sky-400";
                                        return "";
                                    })())}>{season.pass_attempts ? ((season.pass_yards || 0) / season.pass_attempts).toFixed(1) : '—'}</TableCell>
                                </>
                            )}

                            <TableCell className="text-right">{(isWR || isTE) && !season.rush_attempts ? '—' : (season.rush_attempts || 0)}</TableCell>
                            <TableCell className={cn("text-right", isBest('rushYds', si))}>{(isWR || isTE) && !season.rush_attempts ? '—' : (season.rush_yards || 0)}</TableCell>
                            <TableCell className={cn("text-right", isBest('ypc', si) || (() => {
                                if (!season.rush_attempts) return "";
                                const ypc = (season.rush_yards || 0) / season.rush_attempts;
                                if (ypc >= 6.0) return "text-emerald-400 font-bold";
                                if (ypc >= 5.0) return "text-sky-400";
                                return "";
                            })())}>{season.rush_attempts ? ((season.rush_yards || 0) / season.rush_attempts).toFixed(1) : '—'}</TableCell>
                            <TableCell className={cn("text-right", isBest('rushTds', si))}>{(isWR || isTE) && !season.rush_attempts ? '—' : (season.rush_tds || 0)}</TableCell>

                            {(isRB || isWR || isTE) && (
                                <>
                                    <TableCell className={cn("text-right", isBest('rec', si))}>{season.receptions ?? '—'}</TableCell>
                                    <TableCell className={cn("text-right", isBest('recYds', si))}>{season.rec_yards ?? '—'}</TableCell>
                                    <TableCell className={cn("text-right", isBest('ypr', si) || (() => {
                                        if (!season.receptions) return "";
                                        const ypr = (season.rec_yards || 0) / season.receptions;
                                        if (ypr >= 16.0) return "text-emerald-400 font-bold";
                                        if (ypr >= 12.0) return "text-sky-400";
                                        return "";
                                    })())}>{season.receptions ? ((season.rec_yards || 0) / season.receptions).toFixed(1) : '—'}</TableCell>
                                    <TableCell className={cn("text-right", isBest('recTds', si))}>{season.rec_tds ?? '—'}</TableCell>
                                    {(isWR || isTE) && (
                                        <TableCell className="text-right text-muted-foreground">
                                            {(season as any).yards_after_catch != null && (season as any).yards_after_catch > 0
                                                ? Number((season as any).yards_after_catch).toFixed(0)
                                                : '—'}
                                        </TableCell>
                                    )}
                                </>
                            )}

                            {isQB ? (
                                <TableCell className={cn("text-right text-muted-foreground", isBest('compPct', si))}>
                                    {season.pass_attempts ? ((season.completions || 0) / season.pass_attempts * 100).toFixed(1) + '%' : '—'}
                                </TableCell>
                            ) : isRB ? (
                                <TableCell className={cn("text-right text-muted-foreground", isBest('scrimYpg', si))}>
                                    {season.games_played ? (((season.rush_yards || 0) + (season.rec_yards || 0)) / season.games_played).toFixed(1) : '—'}
                                </TableCell>
                            ) : (isWR || isTE) ? (
                                <TableCell className={cn("text-right text-muted-foreground", isBest('tgtG', si))}>
                                    {season.games_played && (season.targets || season.receptions) ? ((season.targets || season.receptions || 0) / season.games_played).toFixed(1) : '—'}
                                </TableCell>
                            ) : (
                                <TableCell className="text-right text-muted-foreground">—</TableCell>
                            )}
                        </TableRow>
                    ))}

                    {/* CAREER ROW */}
                    {stats.length > 1 && (() => {
                        const t = stats.reduce(
                            (acc, row) => ({
                                games_played: acc.games_played + (row.games_played || 0),
                                pass_attempts: acc.pass_attempts + (row.pass_attempts || 0),
                                completions: acc.completions + (row.completions || 0),
                                pass_yards: acc.pass_yards + (row.pass_yards || 0),
                                pass_tds: acc.pass_tds + (row.pass_tds || 0),
                                interceptions: acc.interceptions + (row.interceptions || 0),
                                rush_attempts: acc.rush_attempts + (row.rush_attempts || 0),
                                rush_yards: acc.rush_yards + (row.rush_yards || 0),
                                rush_tds: acc.rush_tds + (row.rush_tds || 0),
                                receptions: acc.receptions + (row.receptions || 0),
                                rec_yards: acc.rec_yards + (row.rec_yards || 0),
                                rec_tds: acc.rec_tds + (row.rec_tds || 0),
                            }),
                            {
                                games_played: 0, pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
                                rush_attempts: 0, rush_yards: 0, rush_tds: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
                            }
                        );
                        return (
                            <TableRow className="bg-muted/50 font-black hover:bg-muted/70">
                                <TableCell>CAREER</TableCell>
                                <TableCell className="text-muted-foreground">—</TableCell>
                                <TableCell className="text-right">{t.games_played}</TableCell>

                                {isQB && (
                                    <>
                                        <TableCell className="text-right">{t.completions}/{t.pass_attempts}</TableCell>
                                        <TableCell className="text-right text-primary">{t.pass_yards}</TableCell>
                                        <TableCell className="text-right">{t.pass_tds}</TableCell>
                                        <TableCell className="text-right">{t.interceptions}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{t.pass_attempts > 0 ? (t.pass_yards / t.pass_attempts).toFixed(1) : '—'}</TableCell>
                                    </>
                                )}

                                <TableCell className="text-right">{(isWR || isTE) && t.rush_attempts === 0 ? '—' : t.rush_attempts}</TableCell>
                                <TableCell className={cn("text-right", t.rush_yards > 0 ? "text-primary/80" : "text-muted-foreground/40")}>{(isWR || isTE) && t.rush_yards === 0 ? '—' : t.rush_yards}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{t.rush_attempts > 0 ? (t.rush_yards / t.rush_attempts).toFixed(1) : '—'}</TableCell>
                                <TableCell className="text-right">{(isWR || isTE) && t.rush_tds === 0 ? '—' : t.rush_tds}</TableCell>

                                {(isRB || isWR || isTE) && (
                                    <>
                                        <TableCell className="text-right">{t.receptions}</TableCell>
                                        <TableCell className="text-right text-primary/80">{t.rec_yards}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{t.receptions > 0 ? (t.rec_yards / t.receptions).toFixed(1) : '—'}</TableCell>
                                        <TableCell className="text-right">{t.rec_tds}</TableCell>
                                        {(isWR || isTE) && <TableCell className="text-right text-muted-foreground">—</TableCell>}
                                    </>
                                )}

                                {isQB ? (
                                    <TableCell className="text-right text-muted-foreground">
                                        {t.pass_attempts > 0 ? ((t.completions / t.pass_attempts) * 100).toFixed(1) + '%' : '—'}
                                    </TableCell>
                                ) : isRB ? (
                                    <TableCell className="text-right text-muted-foreground">
                                        {t.games_played > 0 ? ((t.rush_yards + t.rec_yards) / t.games_played).toFixed(1) : '—'}
                                    </TableCell>
                                ) : (isWR || isTE) ? (
                                    <TableCell className="text-right text-muted-foreground">
                                        {(() => {
                                            const totalTgt = stats.reduce((sum, s) => sum + (s.targets || 0), 0);
                                            return t.games_played > 0 && totalTgt > 0 ? (totalTgt / t.games_played).toFixed(1) : '—';
                                        })()}
                                    </TableCell>
                                ) : (
                                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                                )}
                            </TableRow>
                        );
                    })()}
                </TableBody>
            </Table>

            {/* Best season legend */}
            {stats.length > 1 && (
                <div className="px-4 py-2 border-t border-border/20 flex items-center gap-2">
                    <span className="text-yellow-300 text-[10px] font-extrabold">&#9733;</span>
                    <span className="text-[10px] text-muted-foreground/40">= career-best season</span>
                </div>
            )}
        </div>
    );
}
