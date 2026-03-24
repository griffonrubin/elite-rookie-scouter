import type { CollegeStats } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
    stats: CollegeStats[];
    peerAdvanced: any[];
    playerId: number;
}

function pctRank(val: number, arr: number[], higherBetter = true): number {
    const clean = arr.filter(v => isFinite(v) && v > 0);
    if (clean.length === 0) return 50;
    if (higherBetter) {
        return Math.round((clean.filter(v => v < val).length / clean.length) * 100);
    } else {
        return Math.round((clean.filter(v => v > val).length / clean.length) * 100);
    }
}

function cellColors(pct: number): { bg: string; text: string; bar: string } {
    if (pct >= 85) return { bg: 'bg-emerald-500/20 border-emerald-500/20', text: 'text-emerald-300', bar: 'bg-emerald-400' };
    if (pct >= 65) return { bg: 'bg-green-500/15 border-green-500/15',     text: 'text-green-300',   bar: 'bg-green-400'   };
    if (pct >= 45) return { bg: 'bg-yellow-500/15 border-yellow-500/15',   text: 'text-yellow-300',  bar: 'bg-yellow-400'  };
    if (pct >= 25) return { bg: 'bg-orange-500/15 border-orange-500/15',   text: 'text-orange-300',  bar: 'bg-orange-400'  };
    return               { bg: 'bg-red-500/15 border-red-500/15',           text: 'text-red-300',     bar: 'bg-red-400'     };
}

export function RBProductionTable({ stats, peerAdvanced, playerId }: Props) {
    if (!stats.length || peerAdvanced.length < 3) return null;

    // ── This player's career totals ──────────────────────────────────────
    const carGames     = stats.reduce((s, r) => s + (r.games_played ?? 0), 0);
    const carRushAtt   = stats.reduce((s, r) => s + (r.rush_attempts ?? 0), 0);
    const carRushYds   = stats.reduce((s, r) => s + (r.rush_yards ?? 0), 0);
    const carRushTds   = stats.reduce((s, r) => s + (r.rush_tds ?? 0), 0);
    const carRecTds    = stats.reduce((s, r) => s + (r.rec_tds ?? 0), 0);
    const carTds       = carRushTds + carRecTds;
    const carYacCont   = stats.reduce((s, r) => s + (r.yards_after_contact ?? 0), 0);
    const carMtf       = stats.reduce((s, r) => s + (r.missed_tackles_forced ?? 0), 0);
    const carRoutes    = stats.reduce((s, r) => s + (r.routes_run ?? 0), 0);
    const carRecYds    = stats.reduce((s, r) => s + (r.rec_yards ?? 0), 0);
    const carExplosive = Math.round(stats.reduce((s, r) => s + (r.explosive_run_rate ?? 0) * (r.rush_attempts ?? 0), 0));
    const carBreakaway = Math.round(stats.reduce((s, r) => s + (r.breakaway_run_rate ?? 0) * (r.rush_attempts ?? 0), 0));
    const carYpc       = carRushAtt > 0 ? carRushYds / carRushAtt : null;
    // Fumbles: sum non-null season values; null means no data at all
    const fumbleSeasons = stats.filter(r => r.fumbles != null);
    const carFumbles   = fumbleSeasons.length > 0
        ? fumbleSeasons.reduce((s, r) => s + (r.fumbles ?? 0), 0)
        : null;

    // ── Peer arrays for percentile calc ──────────────────────────────────
    const n = (x: any) => Number(x) || 0;
    const peerGames     = peerAdvanced.map(p => n(p.games));
    const peerRushAtt   = peerAdvanced.map(p => n(p.rush_att));
    const peerRushYds   = peerAdvanced.map(p => n(p.rush_yards));
    const peerTds       = peerAdvanced.map(p => n(p.rush_tds) + n(p.rec_tds));
    const peerYacCont   = peerAdvanced.map(p => n(p.yac_contact));
    const peerMtf       = peerAdvanced.map(p => n(p.mtf));
    const peerRoutes    = peerAdvanced.map(p => n(p.routes));
    const peerRecYds    = peerAdvanced.map(p => n(p.rec_yards));
    const peerExplosive = peerAdvanced.map(p => n(p.explosive_att));
    const peerBreakaway = peerAdvanced.map(p => n(p.breakaway_att));
    const peerYpc       = peerAdvanced.map(p => n(p.rush_att) > 0 ? n(p.rush_yards) / n(p.rush_att) : 0);
    // For fumbles, only include peers who have any data (fumbles !== null)
    const peerFumbles   = peerAdvanced
        .filter(p => p.fumbles != null)
        .map(p => n(p.fumbles));

    type MetricSpec = {
        label: string;
        abbr: string;
        value: number | null;
        arr: number[];
        fmt: (v: number) => string;
        higherBetter?: boolean;
    };

    const metrics: MetricSpec[] = [
        { label: 'Career Games',    abbr: 'G',       value: carGames > 0 ? carGames : null,         arr: peerGames,     fmt: v => String(v) },
        { label: 'Attempts',        abbr: 'ATT',     value: carRushAtt > 0 ? carRushAtt : null,     arr: peerRushAtt,   fmt: v => String(v) },
        { label: 'Rush Yards',      abbr: 'RUSH YDS',value: carRushYds > 0 ? carRushYds : null,     arr: peerRushYds,   fmt: v => v.toLocaleString() },
        { label: 'Yds / Att',       abbr: 'YD/ATT',  value: carYpc,                                 arr: peerYpc,       fmt: v => v.toFixed(1) },
        { label: 'Touchdowns',      abbr: 'TDs',     value: carTds > 0 ? carTds : null,             arr: peerTds,       fmt: v => String(v) },
        { label: 'Fumbles',         abbr: 'FUM',     value: carFumbles,                              arr: peerFumbles,   fmt: v => String(v), higherBetter: false },
        { label: 'Yds After Cont.', abbr: 'YAC',     value: carYacCont > 0 ? carYacCont : null,     arr: peerYacCont,   fmt: v => v.toLocaleString() },
        { label: 'Explosive (10+)', abbr: 'EXPL',    value: carExplosive > 0 ? carExplosive : null, arr: peerExplosive, fmt: v => String(v) },
        { label: 'Breakaway (15+)', abbr: 'BKWY',    value: carBreakaway > 0 ? carBreakaway : null, arr: peerBreakaway, fmt: v => String(v) },
        { label: 'Avoided Tackles', abbr: 'MTF',     value: carMtf > 0 ? carMtf : null,             arr: peerMtf,       fmt: v => String(v) },
        { label: 'Routes Run',      abbr: 'ROUTES',  value: carRoutes > 0 ? carRoutes : null,       arr: peerRoutes,    fmt: v => String(v) },
        { label: 'Rec Yards',       abbr: 'REC YDS', value: carRecYds > 0 ? carRecYds : null,       arr: peerRecYds,    fmt: v => v.toLocaleString() },
    ];

    return (
        <div className="mb-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2.5">
                Career Production Metrics · Class of 2026
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12 gap-1.5">
                {metrics.map(({ label, abbr, value, arr, fmt, higherBetter = true }) => {
                    if (value == null) {
                        return (
                            <div key={label} className="rounded-lg px-2 py-3 text-center bg-muted/10 border border-border/20 flex flex-col justify-center gap-1">
                                <div className="text-sm font-black font-mono text-muted-foreground/20 leading-none">—</div>
                                <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/25 leading-tight">{abbr}</div>
                            </div>
                        );
                    }
                    const pct = pctRank(value, arr, higherBetter);
                    const { bg, text, bar } = cellColors(pct);
                    return (
                        <div
                            key={label}
                            className={cn('rounded-lg px-2 py-3 text-center border flex flex-col justify-center gap-1 group relative', bg)}
                            title={`${label}: ${fmt(value)} · ${pct}th percentile in class`}
                        >
                            <div className={cn('text-sm font-black font-mono leading-none', text)}>
                                {fmt(value)}
                            </div>
                            <div className={cn('text-[8px] font-bold uppercase tracking-wider leading-tight opacity-75', text)}>
                                {abbr}
                            </div>
                            <div className="mt-1 h-0.5 bg-black/20 rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full opacity-70', bar)} style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
