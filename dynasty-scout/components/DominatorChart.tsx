'use client';

/**
 * DominatorChart
 * Season-by-season dominator rating as a horizontal bar with reference lines.
 * Replaces the plain table in the Scout tab.
 */

interface DominatorRow {
    season: number | string;
    school?: string | null;
    dominator_rating?: number | null;
    market_share?: number | null;
}

interface Props {
    data: DominatorRow[];
    position: string;
}

const ELITE_DOM   = 25; // ≥25% = elite dominator
const GOOD_DOM    = 15; // ≥15% = starter-level
const ELITE_MKT   = 30; // ≥30% mkt share = elite
const GOOD_MKT    = 20;

function domColor(v: number): string {
    if (v >= ELITE_DOM)  return 'bg-emerald-400';
    if (v >= GOOD_DOM)   return 'bg-cyan-400';
    if (v >= 8)          return 'bg-yellow-400';
    return 'bg-orange-400';
}

function domTextColor(v: number): string {
    if (v >= ELITE_DOM)  return 'text-emerald-400';
    if (v >= GOOD_DOM)   return 'text-cyan-400';
    if (v >= 8)          return 'text-yellow-400';
    return 'text-orange-400';
}

function mktColor(v: number): string {
    if (v >= ELITE_MKT)  return 'bg-violet-400';
    if (v >= GOOD_MKT)   return 'bg-violet-300';
    return 'bg-violet-500/50';
}

export function DominatorChart({ data, position }: Props) {
    if (!data || data.length === 0) return null;

    // max for bar scaling
    const maxDom = Math.max(40, ...data.map(r => r.dominator_rating ?? 0));
    const maxMkt = Math.max(50, ...data.map(r => r.market_share ?? 0));

    const hasDom = data.some(r => r.dominator_rating != null);
    const hasMkt = data.some(r => r.market_share != null);

    return (
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Production Share</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">by season</span>
            </div>

            <div className="p-4 space-y-4">
                {data.map(row => {
                    const dom = row.dominator_rating;
                    const mkt = row.market_share;
                    return (
                        <div key={row.season} className="space-y-1.5">
                            {/* Season header */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold font-mono text-muted-foreground w-10">{row.season}</span>
                                <span className="text-[11px] text-muted-foreground/60 truncate">{row.school}</span>
                            </div>

                            {/* Dominator bar */}
                            {hasDom && (
                                <div className="grid grid-cols-[64px_1fr_48px] items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide text-right">DOM %</span>
                                    <div className="relative h-3 bg-border/25 rounded-full overflow-hidden">
                                        {dom != null && (
                                            <div
                                                className={`absolute left-0 top-0 h-full rounded-full ${domColor(dom)} transition-all duration-700`}
                                                style={{ width: `${Math.min(100, (dom / maxDom) * 100)}%` }}
                                            />
                                        )}
                                        {/* Elite reference line */}
                                        <div
                                            className="absolute top-0 h-full w-px bg-emerald-400/40"
                                            style={{ left: `${(ELITE_DOM / maxDom) * 100}%` }}
                                        />
                                        <div
                                            className="absolute top-0 h-full w-px bg-white/10"
                                            style={{ left: `${(GOOD_DOM / maxDom) * 100}%` }}
                                        />
                                    </div>
                                    <span className={`text-xs font-black font-mono text-right ${dom != null ? domTextColor(dom) : 'text-muted-foreground/20'}`}>
                                        {dom != null ? `${dom.toFixed(1)}%` : '—'}
                                    </span>
                                </div>
                            )}

                            {/* Market share bar */}
                            {hasMkt && (
                                <div className="grid grid-cols-[64px_1fr_48px] items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide text-right">MKT %</span>
                                    <div className="relative h-3 bg-border/25 rounded-full overflow-hidden">
                                        {mkt != null && (
                                            <div
                                                className={`absolute left-0 top-0 h-full rounded-full ${mktColor(mkt)} transition-all duration-700`}
                                                style={{ width: `${Math.min(100, (mkt / maxMkt) * 100)}%` }}
                                            />
                                        )}
                                    </div>
                                    <span className="text-xs font-black font-mono text-right text-violet-400/80">
                                        {mkt != null ? `${mkt.toFixed(1)}%` : '—'}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="px-4 py-2 border-t border-border/20 flex flex-wrap gap-4 text-[9px] text-muted-foreground/50">
                <span><span className="text-emerald-400 font-bold">DOM ≥25%</span> = Elite dominator</span>
                <span><span className="text-cyan-400 font-bold">DOM ≥15%</span> = Starter-level</span>
                <span><span className="text-violet-400 font-bold">MKT</span> = Team pass yards share</span>
            </div>
        </div>
    );
}
