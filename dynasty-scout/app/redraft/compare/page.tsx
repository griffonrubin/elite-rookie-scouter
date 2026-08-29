import { query, queryOne } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft, Scale } from 'lucide-react';
import { POSITION_COLORS, POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { ComparePlayerPicker } from '@/components/ComparePlayerPicker';
import { RadarChart, type RadarMetric } from '@/components/RadarChart';
import { NflSeasonStat } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ a?: string; b?: string }>;
}

const PLAYER_SQL = `
  SELECT p.id, p.slug, p.full_name, p.position, p.nfl_team, p.dob,
         p.height_inches, p.weight_lbs, p.years_exp, p.draft_year,
         p.nfl_headshot_url, p.headshot_url,
         t.logo_url AS team_logo, t.full_name AS team_name,
         c.rank_overall, c.rank_positional, c.avg_rank, c.best_rank,
         c.worst_rank, c.std_deviation, c.num_sources
  FROM players p
  LEFT JOIN nfl_teams t ON t.abbreviation = p.nfl_team
  LEFT JOIN consensus_rankings c
    ON c.player_id = p.id AND c.format = 'REDRAFT'
   AND c.calculated_at = (
     SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
   )
  WHERE p.slug = $1 AND p.redraft_pool = 1
`;

async function getPlayer(slug?: string) {
    if (!slug) return null;
    const player = await queryOne<any>(PLAYER_SQL, [slug]);
    if (!player) return null;
    const seasons = await query<NflSeasonStat>(
        `SELECT * FROM nfl_season_stats WHERE player_id = $1 ORDER BY season DESC`,
        [player.id]
    );
    const proj = await queryOne<{ pts: number; n: number }>(
        // Newest scrape per source only — see the proj CTE in redraftBoardQuery.
        `SELECT AVG(pr.proj_points) AS pts, COUNT(*) AS n
         FROM projections pr
         JOIN (
           SELECT source, MAX(scraped_at) AS md
           FROM projections WHERE player_id = $1 AND season = 2026 GROUP BY source
         ) lp ON lp.source = pr.source AND pr.scraped_at = lp.md
         WHERE pr.player_id = $2 AND pr.season = 2026`,
        // Numbered separately: lib/db.ts rewrites every $N to a positional ?
        // for SQLite, where a reused $1 needs its own bound value.
        [player.id, player.id]
    );
    return { ...player, seasons, proj_points: proj?.pts ?? null, proj_sources: proj?.n ?? 0 };
}

function ageFrom(dob: string | null): number | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const yrs = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return yrs > 0 && yrs < 60 ? Number(yrs.toFixed(1)) : null;
}

function fmt(v: any, digits = 0): string {
    if (v == null) return '—';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString();
}

/** Rows compared head to head. `better: 'high' | 'low'` sets who wins. */
function buildRows(a: any, b: any) {
    const last = (p: any) => p.seasons?.[0];
    const careerBest = (p: any) => (p.seasons || []).reduce(
        (best: number | null, s: NflSeasonStat) =>
            best == null || (s.ppg_ppr ?? 0) > best ? (s.ppg_ppr ?? 0) : best,
        null as number | null
    );
    const seasonsTop12 = (p: any) =>
        (p.seasons || []).filter((s: NflSeasonStat) =>
            s.finish_positional != null && s.finish_positional <= 12).length;

    return [
        { label: 'Consensus rank', a: a.rank_overall, b: b.rank_overall, better: 'low' as const },
        { label: 'Positional rank', a: a.rank_positional, b: b.rank_positional, better: 'low' as const },
        { label: '2025 PPR points', a: last(a)?.fantasy_points_ppr, b: last(b)?.fantasy_points_ppr, better: 'high' as const, digits: 1 },
        { label: '2025 points/game', a: last(a)?.ppg_ppr, b: last(b)?.ppg_ppr, better: 'high' as const, digits: 1 },
        { label: '2025 games', a: last(a)?.games, b: last(b)?.games, better: 'high' as const },
        { label: 'Best season PPG', a: careerBest(a), b: careerBest(b), better: 'high' as const, digits: 1 },
        { label: 'Top-12 finishes', a: seasonsTop12(a), b: seasonsTop12(b), better: 'high' as const },
        { label: '2026 projection', a: a.proj_points, b: b.proj_points, better: 'high' as const },
        { label: 'Source spread (SD)', a: a.std_deviation, b: b.std_deviation, better: 'low' as const, digits: 1 },
        { label: 'Age', a: ageFrom(a.dob), b: ageFrom(b.dob), better: 'low' as const, digits: 1 },
        { label: 'Experience (yrs)', a: a.years_exp, b: b.years_exp, better: 'high' as const },
    ];
}

/**
 * Radar axes, each normalised 0-100 across the pair.
 *
 * The better value always plots at 100 and the other is drawn as a ratio of
 * it. Scaling "lower is better" axes as `100 - x/max` instead would collapse
 * close values (a 1.5-year age gap rendered as 0 vs 5, which reads as missing
 * data rather than a near-tie).
 */
function buildRadar(a: any, b: any): RadarMetric[] {
    const last = (p: any) => p.seasons?.[0];
    const pct = (av: number | null | undefined, bv: number | null | undefined, lowerIsBetter = false) => {
        const x = Number(av ?? 0), y = Number(bv ?? 0);
        if (x <= 0 && y <= 0) return [0, 0] as const;
        if (lowerIsBetter) {
            // Guard against a zero/missing value making the ratio blow up.
            const best = Math.min(x > 0 ? x : Infinity, y > 0 ? y : Infinity);
            return [
                x > 0 ? (best / x) * 100 : 0,
                y > 0 ? (best / y) * 100 : 0,
            ] as const;
        }
        const max = Math.max(x, y);
        return [(x / max) * 100, (y / max) * 100] as const;
    };

    const [ppgA, ppgB] = pct(last(a)?.ppg_ppr, last(b)?.ppg_ppr);
    const [ptsA, ptsB] = pct(last(a)?.fantasy_points_ppr, last(b)?.fantasy_points_ppr);
    const [gA, gB] = pct(last(a)?.games, last(b)?.games);
    const [prA, prB] = pct(a.proj_points, b.proj_points);
    // Ranks and age read better when lower.
    const [rkA, rkB] = pct(a.rank_overall ?? 400, b.rank_overall ?? 400, true);
    const [agA, agB] = pct(ageFrom(a.dob) ?? 30, ageFrom(b.dob) ?? 30, true);

    return [
        { label: 'PPG', a: ppgA, b: ppgB },
        { label: 'Volume', a: ptsA, b: ptsB },
        { label: 'Availability', a: gA, b: gB },
        { label: 'Projection', a: prA, b: prB },
        { label: 'Market', a: rkA, b: rkB },
        { label: 'Youth', a: agA, b: agB },
    ] as RadarMetric[];
}

export default async function RedraftComparePage({ searchParams }: PageProps) {
    const { a: slugA, b: slugB } = await searchParams;
    const [a, b] = await Promise.all([getPlayer(slugA), getPlayer(slugB)]);

    const bothPicked = a && b;
    const rows = bothPicked ? buildRows(a, b) : [];
    const radar = bothPicked ? buildRadar(a, b) : [];

    // Count decisive wins to headline the verdict.
    let winsA = 0, winsB = 0;
    for (const r of rows) {
        if (r.a == null || r.b == null || Number(r.a) === Number(r.b)) continue;
        const aWins = r.better === 'low' ? Number(r.a) < Number(r.b) : Number(r.a) > Number(r.b);
        if (aWins) winsA++; else winsB++;
    }
    const leader = winsA === winsB ? null : (winsA > winsB ? a : b);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />
            <main className="w-full px-3 sm:px-8 lg:px-12 py-5 mx-auto max-w-6xl">
                <Link href="/redraft"
                    className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to board
                </Link>

                <ComparePlayerPicker
                    currentSlugA={a?.slug}
                    currentSlugB={b?.slug}
                    currentNameA={a?.full_name}
                    currentNameB={b?.full_name}
                    apiPath="/api/redraft/search"
                    comparePath="/redraft/compare"
                />

                {!bothPicked ? (
                    <div className="p-16 text-center border border-dashed border-border rounded-2xl">
                        <Scale className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                        <div className="text-sm text-muted-foreground">
                            Pick two players above to compare their production, market value, and outlook.
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Verdict */}
                        {leader && (
                            <div className="rounded-2xl border border-white/[0.06] px-5 py-4 text-center"
                                style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.10), transparent 70%)' }}>
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold">
                                    Edge
                                </div>
                                <div className="text-xl font-bold mt-1">
                                    {leader.full_name.toUpperCase()} HAS THE EDGE
                                </div>
                                <div className="text-[12px] text-muted-foreground mt-1">
                                    Wins {Math.max(winsA, winsB)} of {winsA + winsB} compared categories
                                </div>
                            </div>
                        )}

                        {/* Headers */}
                        <div className="grid grid-cols-2 gap-3">
                            {[a, b].map((p, i) => {
                                const pos = (p.position || '').toUpperCase();
                                const headshot = p.nfl_headshot_url || p.headshot_url;
                                return (
                                    <Link key={p.slug} href={`/redraft/players/${p.slug}`}
                                        className="rounded-2xl border border-white/[0.06] p-4 hover:border-white/20 transition-colors"
                                        style={{ background: 'var(--bg-card)' }}>
                                        <div className="flex items-center gap-3">
                                            {headshot && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={headshot} alt="" className="w-14 h-14 rounded-lg object-cover bg-white/5"
                                                    style={{ border: `2px solid ${i === 0 ? '#fb923c' : '#38bdf8'}55` }} />
                                            )}
                                            <div className="min-w-0">
                                                <div className="font-bold truncate">{p.full_name}</div>
                                                <div className="flex items-center gap-1.5 text-[11px] mt-1">
                                                    <span className={cn('px-1.5 py-0.5 rounded font-bold', POSITION_COLORS[pos])}>
                                                        {pos}{p.rank_positional ?? ''}
                                                    </span>
                                                    <span className="text-muted-foreground">{p.nfl_team || 'FA'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Radar */}
                        {radar.length > 0 && (
                            <div className="rounded-2xl border border-white/[0.06] p-4" style={{ background: 'var(--bg-card)' }}>
                                <div className="text-sm font-bold mb-2">Profile shape</div>
                                <RadarChart
                                    metrics={radar}
                                    nameA={a.full_name}
                                    nameB={b.full_name}
                                    colorA="#fb923c"
                                    colorB="#38bdf8"
                                />
                                <div className="text-[10px] text-muted-foreground/50 mt-2">
                                    Each axis is scaled against the better of the two players, so
                                    further out is always better — including Market and Youth, where a
                                    lower rank and a younger age win.
                                </div>
                            </div>
                        )}

                        {/* Head-to-head table */}
                        <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
                            style={{ background: 'var(--bg-card)' }}>
                            {rows.map(r => {
                                const av = r.a == null ? null : Number(r.a);
                                const bv = r.b == null ? null : Number(r.b);
                                const decided = av != null && bv != null && av !== bv;
                                const aWins = decided && (r.better === 'low' ? av < bv : av > bv);
                                const bWins = decided && !aWins;
                                const digits = (r as any).digits ?? 0;
                                return (
                                    <div key={r.label}
                                        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 border-b border-white/[0.03] last:border-0">
                                        <div className={cn(
                                            'text-right font-[var(--font-jetbrains),monospace] text-[13px] flex items-center justify-end gap-2',
                                            aWins ? 'text-orange-400 font-bold' : 'text-foreground/70',
                                        )}>
                                            {aWins && (
                                                <span className="px-1 rounded bg-orange-500/20 text-orange-400 text-[9px] font-bold">W</span>
                                            )}
                                            {fmt(r.a, digits)}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground/70 text-center whitespace-nowrap px-2 min-w-[130px]">
                                            {r.label}
                                        </div>
                                        <div className={cn(
                                            'text-left font-[var(--font-jetbrains),monospace] text-[13px] flex items-center gap-2',
                                            bWins ? 'text-sky-400 font-bold' : 'text-foreground/70',
                                        )}>
                                            {fmt(r.b, digits)}
                                            {bWins && (
                                                <span className="px-1 rounded bg-sky-500/20 text-sky-400 text-[9px] font-bold">W</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
