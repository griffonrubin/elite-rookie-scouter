import { cn } from '@/lib/utils';

interface Props { rbCareer: any; peerRBAdv: any[]; }

function pctRank(val: number, arr: number[], higherBetter = true): number {
    const clean = arr.filter(v => isFinite(v) && v > 0);
    if (clean.length === 0) return 50;
    return higherBetter
        ? Math.round((clean.filter(v => v < val).length / clean.length) * 100)
        : Math.round((clean.filter(v => v > val).length / clean.length) * 100);
}

function cellColors(pct: number): { bg: string; text: string; bar: string } {
    if (pct >= 85) return { bg: 'bg-emerald-500/20 border-emerald-500/20', text: 'text-emerald-300', bar: 'bg-emerald-400' };
    if (pct >= 65) return { bg: 'bg-green-500/15 border-green-500/15', text: 'text-green-300', bar: 'bg-green-400' };
    if (pct >= 45) return { bg: 'bg-yellow-500/15 border-yellow-500/15', text: 'text-yellow-300', bar: 'bg-yellow-400' };
    if (pct >= 25) return { bg: 'bg-orange-500/15 border-orange-500/15', text: 'text-orange-300', bar: 'bg-orange-400' };
    return { bg: 'bg-red-500/15 border-red-500/15', text: 'text-red-300', bar: 'bg-red-400' };
}

type M = { label: string; abbr: string; key: string; fmt: (v: number) => string; higherBetter?: boolean; tooltip: string; };

const METRICS: M[] = [
    { label: 'Avoided Tackle %', abbr: 'ATK%',  key: 'avoided_tackle_pct', fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: 'Avoided tackles as % of touch attempts' },
    { label: 'YPRR',             abbr: 'YPRR',  key: 'yprr',               fmt: v => v.toFixed(2),       higherBetter: true,  tooltip: 'Receiving yards per route run' },
    { label: 'Target Rate',      abbr: 'TGT%',  key: 'target_rate',        fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: '% of routes resulting in a target' },
    { label: 'Drop Rate',        abbr: 'DRP%',  key: 'drop_rate',          fmt: v => v.toFixed(1) + '%', higherBetter: false, tooltip: 'Drops as % of catchable targets' },
    { label: 'Fumble Rate',      abbr: 'FUM%',  key: 'fumble_rate',        fmt: v => v.toFixed(1) + '%', higherBetter: false, tooltip: 'Fumbles per 100 rush attempts' },
    { label: 'Explosive Rate',   abbr: 'EXP%',  key: 'explosive_rate',     fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: '10+ yard runs as % of attempts' },
    { label: 'Breakaway Rate',   abbr: 'BKW%',  key: 'breakaway_rate',     fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: '15+ yard runs as % of attempts' },
    { label: 'First Down Rate',  abbr: '1D%',   key: 'first_down_rate',    fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: 'First downs as % of carries + targets' },
    { label: 'TD / Route',       abbr: 'TD/RT', key: 'td_per_route',       fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: 'Receiving TDs per 100 routes run' },
    { label: 'Gap Rate',         abbr: 'GAP%',  key: 'gap_rate',           fmt: v => v.toFixed(1) + '%', higherBetter: false, tooltip: '% of rushes vs gap/power defense' },
    { label: 'Zone Rate',        abbr: 'ZONE%', key: 'zone_rate',          fmt: v => v.toFixed(1) + '%', higherBetter: true,  tooltip: '% of pass routes defended by zone' },
];

const PFF_RECV_METRICS: M[] = [
    { label: 'PFF Recv Rating',        abbr: 'RTG',      key: 'pff_recv_rating',          fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'PFF composite RB receiving rating (AYPRR-based) via @ZWKfootball' },
    { label: 'Air Yds / Route',        abbr: 'AYPRR',    key: 'ayprr',                    fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Air yards per route run' },
    { label: 'Air Yds / Target',       abbr: 'AYPT',     key: 'aypt',                     fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Air yards per target' },
    { label: 'Drop Rate',              abbr: 'DRP%',     key: 'drop_rate',                fmt: v => v.toFixed(0) + '%', higherBetter: false, tooltip: 'Drop rate (PFF) — drops as % of catchable targets' },
    { label: 'Career Adj Yd/G',        abbr: 'cAY/G',    key: 'career_adj_ydg',           fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Career adjusted receiving yards per game (all targets)' },
    { label: 'Career Adj Yd/G NS',     abbr: 'cAY-NS',   key: 'career_adj_ydg_nonscreen', fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Career adjusted receiving yards per game (non-screen targets)' },
    { label: 'Career Adj Yd/G 10+DOT', abbr: 'cAY-10',   key: 'career_adj_ydg_10dot',     fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Career adjusted receiving yards per game (10+ depth of target)' },
    { label: 'Best Ssn Adj Yd/TmG',   abbr: 'bAY/G',    key: 'best_season_adj_ydg',      fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Best single-season adjusted receiving yards per team game (all)' },
    { label: 'Best Ssn Adj Yd/TmG NS',abbr: 'bAY-NS',   key: 'best_season_adj_ydg_ns',   fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Best single-season adjusted receiving yards per team game (non-screen)' },
    { label: 'Best Ssn Adj Yd/TmG 10+',abbr: 'bAY-10',  key: 'best_season_adj_ydg_10',   fmt: v => v.toFixed(2),  higherBetter: true,  tooltip: 'Best single-season adjusted receiving yards per team game (10+ DOT)' },
];

function MetricGrid({ metrics, rbCareer, peerRBAdv }: { metrics: M[]; rbCareer: any; peerRBAdv: any[] }) {
    const n = (x: any) => (x != null ? Number(x) : null);
    return (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-10 gap-1.5">
            {metrics.map(({ label, abbr, key, fmt, higherBetter = true, tooltip }) => {
                const raw = n(rbCareer[key]);
                if (raw == null) {
                    return (
                        <div key={key} className="rounded-lg px-2 py-3 text-center bg-muted/10 border border-border/20 flex flex-col justify-center gap-1">
                            <div className="text-sm font-black font-mono text-muted-foreground/20 leading-none">—</div>
                            <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/25 leading-tight">{abbr}</div>
                        </div>
                    );
                }
                const arr = peerRBAdv.map(p => { const v = n(p[key]); return (v != null && isFinite(v)) ? v : 0; }).filter(v => v > 0);
                const pct = pctRank(raw, arr, higherBetter);
                const { bg, text, bar } = cellColors(pct);
                return (
                    <div
                        key={key}
                        className={cn('rounded-lg px-2 py-3 text-center border flex flex-col justify-center gap-1', bg)}
                        title={label + ': ' + fmt(raw) + ' · ' + pct + 'th pct · ' + tooltip}
                    >
                        <div className={cn('text-sm font-black font-mono leading-none', text)}>{fmt(raw)}</div>
                        <div className={cn('text-[8px] font-bold uppercase tracking-wider leading-tight opacity-75', text)}>{abbr}</div>
                        <div className="mt-1 h-0.5 bg-black/20 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full opacity-70', bar)} style={{ width: pct + '%' }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function RBAdvancedRatesTable({ rbCareer, peerRBAdv }: Props) {
    if (!rbCareer || peerRBAdv.length < 3) return null;

    const hasPff = rbCareer.ayprr != null || rbCareer.pff_recv_rating != null;

    return (
        <div className="mb-6 space-y-5">
            <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2.5">
                    Career Advanced Rates · Class of 2026
                </h4>
                <MetricGrid metrics={METRICS} rbCareer={rbCareer} peerRBAdv={peerRBAdv} />
            </div>

            {hasPff && (
                <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2.5">
                        PFF Receiving · Class of 2026 · via @ZWKfootball
                    </h4>
                    <MetricGrid metrics={PFF_RECV_METRICS} rbCareer={rbCareer} peerRBAdv={peerRBAdv} />
                </div>
            )}
        </div>
    );
}

