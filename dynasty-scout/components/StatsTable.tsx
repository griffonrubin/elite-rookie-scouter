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

export function StatsTable({ stats, position }: StatsTableProps) {
    // Define columns based on position
    const isQB = position === 'QB';
    const isRB = position === 'RB';
    const isWR = position === 'WR';
    const isTE = position === 'TE';

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Year</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead className="text-right">GP</TableHead>

                        {/* Passing (QB) */}
                        {isQB && (
                            <>
                                <TableHead className="text-right">Cmp/Att</TableHead>
                                <TableHead className="text-right">Yards</TableHead>
                                <TableHead className="text-right">TD</TableHead>
                                <TableHead className="text-right">INT</TableHead>
                                <TableHead className="text-right">YPA</TableHead>
                            </>
                        )}

                        {/* Rushing (All) */}
                        <TableHead className="text-right">Rush</TableHead>
                        <TableHead className="text-right">Yds</TableHead>
                        <TableHead className="text-right">Avg</TableHead>
                        <TableHead className="text-right">TD</TableHead>

                        {/* Receiving (RB/WR/TE) */}
                        {(isRB || isWR || isTE) && (
                            <>
                                <TableHead className="text-right">Rec</TableHead>
                                <TableHead className="text-right">Yds</TableHead>
                                <TableHead className="text-right">Avg</TableHead>
                                <TableHead className="text-right">TD</TableHead>
                            </>
                        )}

                        {/* Advanced (Generic for now) */}
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
                    {stats.map((season) => (
                        <TableRow key={`${season.season}-${season.school}`}>
                            <TableCell className="font-medium">{season.season}</TableCell>
                            <TableCell>{season.school}</TableCell>
                            <TableCell className="text-right">{season.games_played || '-'}</TableCell>

                            {isQB && (
                                <>
                                    <TableCell className="text-right">{season.completions}/{season.pass_attempts}</TableCell>
                                    <TableCell className="text-right">{season.pass_yards}</TableCell>
                                    <TableCell className="text-right">{season.pass_tds}</TableCell>
                                    <TableCell className="text-right">{season.interceptions}</TableCell>
                                    <TableCell className="text-right">{season.pass_attempts ? ((season.pass_yards || 0) / season.pass_attempts).toFixed(1) : '-'}</TableCell>
                                </>
                            )}

                            <TableCell className="text-right">{season.rush_attempts || 0}</TableCell>
                            <TableCell className="text-right">{season.rush_yards || 0}</TableCell>
                            <TableCell className="text-right">{season.rush_attempts ? ((season.rush_yards || 0) / season.rush_attempts).toFixed(1) : '-'}</TableCell>
                            <TableCell className="text-right">{season.rush_tds || 0}</TableCell>

                            {(isRB || isWR || isTE) && (
                                <>
                                    <TableCell className="text-right">{season.receptions || 0}</TableCell>
                                    <TableCell className="text-right">{season.rec_yards || 0}</TableCell>
                                    <TableCell className="text-right">{season.receptions ? ((season.rec_yards || 0) / season.receptions).toFixed(1) : '-'}</TableCell>
                                    <TableCell className="text-right">{season.rec_tds || 0}</TableCell>
                                </>
                            )}

                            {isQB ? (
                                <TableCell className="text-right text-muted-foreground">
                                    {((season.completions || 0) / (season.pass_attempts || 1) * 100).toFixed(1)}%
                                </TableCell>
                            ) : isRB ? (
                                <TableCell className="text-right text-muted-foreground">
                                    {season.games_played ? (((season.rush_yards || 0) + (season.rec_yards || 0)) / season.games_played).toFixed(1) : '—'}
                                </TableCell>
                            ) : (isWR || isTE) ? (
                                <TableCell className="text-right text-muted-foreground">
                                    {season.games_played ? ((season.targets || season.receptions || 0) / season.games_played).toFixed(1) : '—'}
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

                                <TableCell className="text-right">{t.rush_attempts}</TableCell>
                                <TableCell className={cn("text-right", t.rush_yards > 0 ? "text-primary/80" : "text-muted-foreground/40")}>{t.rush_yards}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{t.rush_attempts > 0 ? (t.rush_yards / t.rush_attempts).toFixed(1) : '—'}</TableCell>
                                <TableCell className="text-right">{t.rush_tds}</TableCell>

                                {(isRB || isWR || isTE) && (
                                    <>
                                        <TableCell className="text-right">{t.receptions}</TableCell>
                                        <TableCell className="text-right text-primary/80">{t.rec_yards}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{t.receptions > 0 ? (t.rec_yards / t.receptions).toFixed(1) : '—'}</TableCell>
                                        <TableCell className="text-right">{t.rec_tds}</TableCell>
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
                                        {t.games_played > 0 ? (stats.reduce((sum, s) => sum + (s.targets || 0), 0) / t.games_played).toFixed(1) : '—'}
                                    </TableCell>
                                ) : (
                                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                                )}
                            </TableRow>
                        );
                    })()}
                </TableBody>
            </Table>
        </div>
    );
}
