import { query } from '@/lib/db';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = "force-dynamic";

// Round order for display
const ROUND_ORDER = [
    'Top 10',
    '1 (Early)', '1 (Mid)', '1 (Late)',
    '2 (Early)', '2 (Mid)', '2 (Late)',
    '3 (Early)', '3 (Mid)', '3 (Late)',
    '4 (Early)', '4 (Mid)', '4 (Late)',
    '5 (Early)', '5 (Mid)', '5 (Late)',
    '6 (Early)', '6 (Mid)', '6 (Late)',
    '7 (Early)', '7 (Mid)', '7 (Late)',
    'UDFA',
];

// Skill positions only (non-IDPs we track)
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

const POS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
    QB: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',  text: 'text-amber-300'  },
    RB: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30',text: 'text-emerald-300'},
    WR: { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',    text: 'text-sky-300'    },
    TE: { bg: 'bg-purple-500/10',  border: 'border-purple-500/30', text: 'text-purple-300' },
};

function roundRound(r: string): string {
    const lo = r.toLowerCase();
    if (lo.includes('top 10'))   return '1';
    const m = lo.match(/^(\d)/);
    return m ? m[1] : '?';
}

function roundColor(round: string): string {
    const r = round.toLowerCase();
    if (r.includes('top 10') || r.includes('1 (')) return 'border-l-emerald-500';
    if (r.includes('2 (')) return 'border-l-cyan-500';
    if (r.includes('3 (')) return 'border-l-blue-500';
    if (r.includes('4 (')) return 'border-l-yellow-500';
    if (r.includes('5 (')) return 'border-l-orange-500';
    return 'border-l-red-500';
}

async function getHorizontalData() {
    const players = await query<{
        slug: string;
        full_name: string;
        position: string;
        round_grade: string;
        headshot_url: string | null;
        overall_grade: number | null;
        nfl_comp: string | null;
    }>(`
        SELECT p.slug, p.full_name, p.position,
               jg.round_grade, p.headshot_url,
               jg.overall_grade, jg.nfl_comp
        FROM players p
        JOIN jfoster_grades jg ON p.id = jg.player_id
        WHERE p.draft_year = 2026
          AND jg.round_grade IS NOT NULL
          AND p.position IN ('QB','RB','WR','TE')
        ORDER BY jg.overall_grade DESC NULLS LAST
    `, []);

    // Group by round → position
    const grid: Record<string, Record<string, typeof players>> = {};
    for (const r of ROUND_ORDER) {
        grid[r] = {};
        for (const pos of POSITIONS) {
            grid[r][pos] = [];
        }
    }
    for (const p of players) {
        const rnd = p.round_grade;
        if (!grid[rnd]) {
            grid[rnd] = {};
            for (const pos of POSITIONS) grid[rnd][pos] = [];
        }
        if (grid[rnd][p.position]) {
            grid[rnd][p.position].push(p);
        }
    }

    // Collect only rounds that have at least one player
    const activeRounds = ROUND_ORDER.filter(r =>
        POSITIONS.some(pos => grid[r]?.[pos]?.length > 0)
    );

    return { grid, activeRounds };
}

export default async function HorizontalPage() {
    const { grid, activeRounds } = await getHorizontalData();

    // Group rounds into major round sections (1, 2, 3, ...)
    const majorRound = (r: string) => {
        if (r === 'Top 10') return '1';
        const m = r.match(/^(\d)/);
        return m ? m[1] : '?';
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />

            <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-10 py-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-foreground">
                            Horizontal Draft Board
                        </h1>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                            JFoster round projections · skill positions · 2026 class
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        {POSITIONS.map(pos => (
                            <div key={pos} className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-bold ${POS_STYLES[pos].bg} ${POS_STYLES[pos].border} ${POS_STYLES[pos].text}`}>
                                {pos}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Board */}
                <div className="rounded-xl border border-border/30 overflow-hidden">
                    {/* Column headers */}
                    <div className="grid bg-white/[0.03] border-b border-border/30"
                        style={{ gridTemplateColumns: '100px repeat(4, 1fr)' }}>
                        <div className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                            Round
                        </div>
                        {POSITIONS.map(pos => (
                            <div key={pos} className={`px-3 py-3 text-center text-xs font-black ${POS_STYLES[pos].text}`}>
                                {pos}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    {activeRounds.map((round, ri) => {
                        const prevMajor = ri > 0 ? majorRound(activeRounds[ri - 1]) : null;
                        const curMajor = majorRound(round);
                        const isNewSection = curMajor !== prevMajor;

                        return (
                            <div key={round}>
                                {/* Section divider when major round changes */}
                                {isNewSection && ri > 0 && (
                                    <div className="h-px bg-border/30 mx-0" />
                                )}
                                <div
                                    className={`grid border-b border-border/[0.08] transition-colors hover:bg-white/[0.01] ${isNewSection ? 'bg-white/[0.02]' : ''}`}
                                    style={{ gridTemplateColumns: '100px repeat(4, 1fr)' }}
                                >
                                    {/* Round label */}
                                    <div className={`px-3 py-3 border-l-2 ${roundColor(round)} flex flex-col justify-start`}>
                                        <span className="text-[10px] font-black font-mono text-muted-foreground/70 leading-none">
                                            {round}
                                        </span>
                                    </div>

                                    {/* Position cells */}
                                    {POSITIONS.map(pos => {
                                        const players = grid[round]?.[pos] ?? [];
                                        const style = POS_STYLES[pos];
                                        return (
                                            <div key={pos} className="px-2 py-2 flex flex-col gap-1">
                                                {players.map(p => (
                                                    <Link
                                                        key={p.slug}
                                                        href={`/players/${p.slug}`}
                                                        className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border ${style.bg} ${style.border} hover:brightness-125 transition-all`}
                                                    >
                                                        {p.headshot_url && (
                                                            <img
                                                                src={p.headshot_url}
                                                                alt={p.full_name}
                                                                className="w-6 h-6 rounded-full object-cover object-top shrink-0 bg-muted/30"
                                                            />
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className={`text-[11px] font-bold leading-tight truncate ${style.text}`}>
                                                                {p.full_name}
                                                            </div>
                                                            {p.nfl_comp && (
                                                                <div className="text-[9px] text-muted-foreground/40 truncate leading-tight">
                                                                    {p.nfl_comp}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {p.overall_grade != null && (
                                                            <span className="text-[9px] font-black font-mono text-muted-foreground/50 shrink-0">
                                                                {p.overall_grade.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </Link>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-4 text-[10px] text-muted-foreground/30 text-right">
                    Source: J. Foster · NoFlagsFilm · jfosterdraft.com
                </div>
            </div>
        </div>
    );
}
