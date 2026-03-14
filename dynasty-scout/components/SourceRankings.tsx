import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Ranking, ConsensusRanking } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface SourceRankingsProps {
    rankings: Ranking[];
    consensus?: ConsensusRanking | null;
    consensusRank?: number | null;
}

export function SourceRankings({ rankings, consensus, consensusRank }: SourceRankingsProps) {
    const effectiveRank = consensusRank ?? consensus?.rank_overall ?? null;

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Rookie Rank</TableHead>
                        <TableHead className="text-right">KTC Dynasty Rank</TableHead>
                        <TableHead className="text-right">Date Scraped</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* Consensus Row */}
                    {effectiveRank != null && (
                        <TableRow className="bg-muted/50 font-medium">
                            <TableCell>2026 Class Consensus</TableCell>
                            <TableCell className="text-right text-lg font-bold">#{effectiveRank}</TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs">
                                Rookie-only ranking
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs">
                                {consensus?.calculated_at || "—"}
                            </TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    )}

                    {rankings.map((r) => {
                        const dynRank = r.rank_overall;

                        return (
                            <TableRow key={r.id}>
                                <TableCell className="font-medium">{r.source}</TableCell>
                                <TableCell className="text-right">
                                    {effectiveRank != null ? `#${effectiveRank}` : "—"}
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                    {dynRank ? (
                                        <span className="text-primary">#{dynRank} overall</span>
                                    ) : "—"}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground text-xs">{r.scraped_at}</TableCell>
                                <TableCell>
                                    {r.source_url && (
                                        <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}

                    {rankings.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No individual ranking sources scraped yet for this player.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
