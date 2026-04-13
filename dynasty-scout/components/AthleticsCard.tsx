'use client';

/**
 * AthleticsCard
 * Position-adjusted athletic grades with visual bars.
 * When peerMeasurables is provided, computes actual class percentiles.
 * Falls back to fixed benchmarks otherwise.
 */

interface MeasurablesInput {
    forty_yard?: number | null;
    ten_yard_split?: number | null;
    vertical_jump?: number | null;
    broad_jump?: number | null;
    three_cone?: number | null;
    twenty_yard_shuttle?: number | null;
    bench_press?: number | null;
    ras?: number | null;
    speed_score?: number | null;
    hand_size?: number | null;
    arm_length?: number | null;
    wingspan?: number | null;
}

interface Props {
    position: string;
    heightInches?: number | null;
    weightLbs?: number | null;
    measurables: MeasurablesInput | null;
    speedScore?: number | null;
    /** All 2026 position-peer measurables for computing real class percentiles */
    peerMeasurables?: MeasurablesInput[] | null;
}

// [poor, elite] per position per metric. lowerIsBetter=true for times.
const BENCH: Record<string, Record<string, { poor: number; elite: number; lowerIsBetter?: boolean }>> = {
    QB: {
        forty:       { poor: 5.10, elite: 4.52, lowerIsBetter: true },
        ten_yard:    { poor: 1.72, elite: 1.53, lowerIsBetter: true },
        vertical:    { poor: 24.0, elite: 38.0 },
        broad:       { poor: 100,  elite: 126   },
        three_cone:  { poor: 7.65, elite: 6.80, lowerIsBetter: true },
        shuttle:     { poor: 4.48, elite: 4.08, lowerIsBetter: true },
        bench:       { poor: 8,    elite: 22    },
        ras:         { poor: 0,    elite: 10    },
        speed_score: { poor: 60,   elite: 110   },
        hand_size:   { poor: 8.5,  elite: 10.5  },
        arm_length:  { poor: 30.0, elite: 33.5  },
        wingspan:    { poor: 72.0, elite: 80.0  },
    },
    RB: {
        forty:       { poor: 4.72, elite: 4.28, lowerIsBetter: true },
        ten_yard:    { poor: 1.65, elite: 1.44, lowerIsBetter: true },
        vertical:    { poor: 28.0, elite: 45.0 },
        broad:       { poor: 110,  elite: 138   },
        three_cone:  { poor: 7.50, elite: 6.52, lowerIsBetter: true },
        shuttle:     { poor: 4.42, elite: 4.06, lowerIsBetter: true },
        bench:       { poor: 12,   elite: 32    },
        ras:         { poor: 0,    elite: 10    },
        speed_score: { poor: 80,   elite: 120   },
        hand_size:   { poor: 8.5,  elite: 10.5  },
        arm_length:  { poor: 29.5, elite: 33.5  },
        wingspan:    { poor: 69.0, elite: 79.0  },
    },
    WR: {
        forty:       { poor: 4.70, elite: 4.27, lowerIsBetter: true },
        ten_yard:    { poor: 1.68, elite: 1.45, lowerIsBetter: true },
        vertical:    { poor: 26.0, elite: 44.0 },
        broad:       { poor: 108,  elite: 135   },
        three_cone:  { poor: 7.45, elite: 6.48, lowerIsBetter: true },
        shuttle:     { poor: 4.42, elite: 4.03, lowerIsBetter: true },
        bench:       { poor: 5,    elite: 21    },
        ras:         { poor: 0,    elite: 10    },
        speed_score: { poor: 80,   elite: 115   },
        hand_size:   { poor: 8.5,  elite: 10.5  },
        arm_length:  { poor: 30.0, elite: 33.5  },
        wingspan:    { poor: 70.0, elite: 81.0  },
    },
    TE: {
        forty:       { poor: 5.00, elite: 4.43, lowerIsBetter: true },
        ten_yard:    { poor: 1.70, elite: 1.50, lowerIsBetter: true },
        vertical:    { poor: 24.0, elite: 42.0 },
        broad:       { poor: 104,  elite: 130   },
        three_cone:  { poor: 7.55, elite: 6.83, lowerIsBetter: true },
        shuttle:     { poor: 4.58, elite: 4.10, lowerIsBetter: true },
        bench:       { poor: 10,   elite: 33    },
        ras:         { poor: 0,    elite: 10    },
        speed_score: { poor: 65,   elite: 103   },
        hand_size:   { poor: 9.0,  elite: 11.0  },
        arm_length:  { poor: 31.0, elite: 35.5  },
        wingspan:    { poor: 74.0, elite: 83.0  },
    },
};

const SIZE_HT_BENCH: Record<string, { poor: number; elite: number }> = {
    QB: { poor: 70, elite: 78 },
    RB: { poor: 66, elite: 74 },
    WR: { poor: 68, elite: 76 },
    TE: { poor: 73, elite: 79 },
};

const SIZE_WT_BENCH: Record<string, { poor: number; elite: number }> = {
    QB: { poor: 195, elite: 240 },
    RB: { poor: 175, elite: 225 },
    WR: { poor: 160, elite: 218 },
    TE: { poor: 235, elite: 272 },
};

/** Compute actual class percentile from peer values */
function classPercentile(val: number, peers: number[], lowerIsBetter: boolean): number {
    if (peers.length === 0) return 50;
    const beaten = peers.filter(p => lowerIsBetter ? p > val : p < val).length;
    return Math.round((beaten / peers.length) * 100);
}

function scoreMetric(val: number, pos: string, key: string): number {
    const b = (BENCH[pos] || BENCH.WR)[key];
    if (!b) return 50;
    const { poor, elite, lowerIsBetter } = b;
    if (lowerIsBetter) {
        if (val <= elite) return 100;
        if (val >= poor) return 0;
        return Math.round(((poor - val) / (poor - elite)) * 100);
    } else {
        if (val >= elite) return 100;
        if (val <= poor) return 0;
        return Math.round(((val - poor) / (elite - poor)) * 100);
    }
}

function gradeOf(pct: number) {
    if (pct >= 90) return { label: 'S+', bar: 'bg-yellow-400',   text: 'text-yellow-400',  badge: 'bg-yellow-400/15  text-yellow-400  border-yellow-400/50'  };
    if (pct >= 80) return { label: 'S',  bar: 'bg-yellow-300',   text: 'text-yellow-300',  badge: 'bg-yellow-300/15  text-yellow-300  border-yellow-300/50'  };
    if (pct >= 70) return { label: 'A',  bar: 'bg-emerald-400',  text: 'text-emerald-400', badge: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/50' };
    if (pct >= 58) return { label: 'B+', bar: 'bg-cyan-400',     text: 'text-cyan-400',    badge: 'bg-cyan-400/15    text-cyan-400    border-cyan-400/50'    };
    if (pct >= 45) return { label: 'B',  bar: 'bg-cyan-500',     text: 'text-cyan-500',    badge: 'bg-cyan-500/15    text-cyan-500    border-cyan-500/50'    };
    if (pct >= 32) return { label: 'C',  bar: 'bg-yellow-500',   text: 'text-yellow-500',  badge: 'bg-yellow-500/15  text-yellow-500  border-yellow-500/50'  };
    if (pct >= 18) return { label: 'D',  bar: 'bg-orange-400',   text: 'text-orange-400',  badge: 'bg-orange-400/15  text-orange-400  border-orange-400/50'  };
    return           { label: 'F',  bar: 'bg-red-400',     text: 'text-red-400',    badge: 'bg-red-400/15    text-red-400    border-red-400/50'    };
}

interface MetricRow {
    label: string;
    display: string;
    key: string;
    pct: number;
    pctLabel: string; // "73rd pctile" or letter grade
    g: ReturnType<typeof gradeOf>;
    fromPeers: boolean;
}

function mkRow(
    label: string,
    val: number | null | undefined,
    pos: string,
    key: string,
    fmt: (v: number) => string,
    peers?: number[],
    lowerIsBetter?: boolean,
): MetricRow | null {
    if (val == null || val === 0) return null;
    let pct: number;
    let fromPeers = false;
    if (peers && peers.length >= 5) {
        pct = classPercentile(val, peers, lowerIsBetter ?? false);
        fromPeers = true;
    } else {
        pct = scoreMetric(val, pos, key);
    }
    return { label, display: fmt(val), key, pct, pctLabel: fromPeers ? `${pct}th` : gradeOf(pct).label, g: gradeOf(pct), fromPeers };
}

function MetricBar({ row }: { row: MetricRow }) {
    return (
        <div className="py-1.5">
            <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] text-muted-foreground/60 leading-none">{row.label}</span>
                <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-black font-mono leading-none ${row.g.text}`}>{row.display}</span>
                    <span className={`text-[10px] font-black py-0.5 px-1.5 rounded border font-mono ${row.g.badge}`}>
                        {row.fromPeers ? `${row.pct}th` : row.g.label}
                    </span>
                </div>
            </div>
            <div className="relative h-2 bg-border/20 rounded-full overflow-hidden">
                <div
                    className={`absolute left-0 top-0 h-full rounded-full ${row.g.bar} transition-all duration-700`}
                    style={{ width: `${Math.max(3, row.pct)}%` }}
                />
                <div className="absolute top-0 h-full w-px bg-white/15" style={{ left: '50%' }} />
            </div>
        </div>
    );
}

/** Extract non-null peer values for a given field */
function peerVals(peers: MeasurablesInput[] | null | undefined, field: keyof MeasurablesInput): number[] {
    if (!peers) return [];
    return peers.map(p => p[field] as number | null | undefined).filter((v): v is number => v != null && v > 0);
}

export function AthleticsCard({ position, heightInches, weightLbs, measurables, speedScore, peerMeasurables }: Props) {
    const pos = (position || 'WR').toUpperCase();
    const m = (measurables || {}) as any;
    const ss = m.speed_score || speedScore;
    const peers = peerMeasurables ?? null;

    // Height percentile
    const htRow: MetricRow | null = (() => {
        if (!heightInches) return null;
        let pct: number;
        let fromPeers = false;
        const htPeers = peers?.map((p: any) => p.height_inches).filter((v: any): v is number => v != null) ?? [];
        if (htPeers.length >= 5) {
            pct = classPercentile(heightInches, htPeers, false);
            fromPeers = true;
        } else {
            const b = SIZE_HT_BENCH[pos] || SIZE_HT_BENCH.WR;
            pct = Math.min(100, Math.max(0, Math.round(((heightInches - b.poor) / (b.elite - b.poor)) * 100)));
        }
        return { label: 'Height', display: `${Math.floor(heightInches / 12)}'${heightInches % 12}"`, key: 'height', pct, pctLabel: fromPeers ? `${pct}th` : gradeOf(pct).label, g: gradeOf(pct), fromPeers };
    })();

    // Weight percentile
    const wtRow: MetricRow | null = (() => {
        if (!weightLbs) return null;
        let pct: number;
        let fromPeers = false;
        const wtPeers = peers?.map((p: any) => p.weight_lbs).filter((v: any): v is number => v != null) ?? [];
        if (wtPeers.length >= 5) {
            pct = classPercentile(weightLbs, wtPeers, false);
            fromPeers = true;
        } else {
            const b = SIZE_WT_BENCH[pos] || SIZE_WT_BENCH.WR;
            pct = Math.min(100, Math.max(0, Math.round(((weightLbs - b.poor) / (b.elite - b.poor)) * 100)));
        }
        return { label: 'Weight', display: `${weightLbs}lb`, key: 'weight', pct, pctLabel: fromPeers ? `${pct}th` : gradeOf(pct).label, g: gradeOf(pct), fromPeers };
    })();

    const wingspanPeers = peerVals(peers, 'wingspan');
    const fortyPeers    = peerVals(peers, 'forty_yard');
    const tenPeers      = peerVals(peers, 'ten_yard_split');
    const vertPeers     = peerVals(peers, 'vertical_jump');
    const broadPeers    = peerVals(peers, 'broad_jump');
    const conePeers     = peerVals(peers, 'three_cone');
    const shuttlePeers  = peerVals(peers, 'twenty_yard_shuttle');
    const handPeers     = peerVals(peers, 'hand_size');
    const armPeers      = peerVals(peers, 'arm_length');

    const groups: { label: string; rows: MetricRow[] }[] = [
        {
            label: 'Size',
            rows: [
                htRow,
                wtRow,
                mkRow('Hand Size',   m.hand_size,   pos, 'hand_size',  v => `${Number(v).toFixed(2)}"`, handPeers),
                mkRow('Arm Length',  m.arm_length,  pos, 'arm_length', v => `${Number(v).toFixed(2)}"`, armPeers),
                mkRow('Wingspan',    m.wingspan,    pos, 'wingspan',   v => `${Number(v).toFixed(2)}"`, wingspanPeers),
            ].filter(Boolean) as MetricRow[],
        },
        {
            label: 'Speed',
            rows: [
                mkRow('40-Yard Dash',  m.forty_yard,     pos, 'forty',      v => `${Number(v).toFixed(2)}s`, fortyPeers, true),
                mkRow('10-Yard Split', m.ten_yard_split,  pos, 'ten_yard',   v => `${Number(v).toFixed(2)}s`, tenPeers,   true),
                mkRow('Speed Score',   ss,                pos, 'speed_score', v => String(Math.round(v))),
            ].filter(Boolean) as MetricRow[],
        },
        {
            label: 'Explosion',
            rows: [
                mkRow('Vertical Jump', m.vertical_jump, pos, 'vertical', v => `${Number(v).toFixed(1)}"`, vertPeers),
                mkRow('Broad Jump',    m.broad_jump,    pos, 'broad',    v => `${Math.round(v)}"`,        broadPeers),
            ].filter(Boolean) as MetricRow[],
        },
        {
            label: 'Agility',
            rows: [
                mkRow('3-Cone Drill', m.three_cone,                           pos, 'three_cone', v => `${Number(v).toFixed(2)}s`, conePeers,   true),
                mkRow('20yd Shuttle', m.twenty_yard_shuttle ?? m.shuttle,     pos, 'shuttle',    v => `${Number(v).toFixed(2)}s`, shuttlePeers, true),
            ].filter(Boolean) as MetricRow[],
        },
        {
            label: 'Athleticism / Strength',
            rows: [
                mkRow('RAS Score',   m.ras,         pos, 'ras',   v => Number(v).toFixed(1)),
                mkRow('Bench Press', m.bench_press, pos, 'bench', v => `${Math.round(v)} reps`),
            ].filter(Boolean) as MetricRow[],
        },
    ].filter(g => g.rows.length > 0);

    const totalRows = groups.reduce((s, g) => s + g.rows.length, 0);
    if (totalRows === 0) return null;

    const usingClassPercentiles = groups.some(g => g.rows.some(r => r.fromPeers));

    return (
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Athletic Profile</span>
                <span className="text-[10px] text-muted-foreground/40 font-mono">
                    {usingClassPercentiles ? `class percentile · 2026 ${pos}s` : `graded vs. 2026 ${pos}s`}
                </span>
            </div>

            <div className="p-5 space-y-6">
                {groups.map((group, gi) => (
                    <div key={group.label} className={gi > 0 ? 'pt-3 border-t border-border/10' : ''}>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 border-l-2 border-primary/40 pl-2">
                            {group.label}
                        </div>
                        <div className="space-y-1">
                            {group.rows.map(row => <MetricBar key={row.key} row={row} />)}
                        </div>
                    </div>
                ))}
            </div>

            <div className="px-5 py-3 border-t border-border/20 flex items-center gap-4 flex-wrap">
                {usingClassPercentiles ? (
                    <span className="text-[9px] text-muted-foreground/40">percentile rank vs. 2026 {pos} class</span>
                ) : (
                    <>
                        {[
                            { pct: 90, desc: 'Elite' },
                            { pct: 70, desc: 'Good' },
                            { pct: 55, desc: 'Avg' },
                            { pct: 32, desc: 'Below' },
                            { pct: 10, desc: 'Poor' },
                        ].map(({ pct, desc }) => {
                            const g = gradeOf(pct);
                            return (
                                <div key={desc} className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-black font-mono ${g.text}`}>{g.label}</span>
                                    <span className="text-[9px] text-muted-foreground/45">{desc}</span>
                                </div>
                            );
                        })}
                        <span className="text-[9px] text-muted-foreground/25 ml-auto">| avg</span>
                    </>
                )}
            </div>
        </div>
    );
}
