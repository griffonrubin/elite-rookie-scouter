import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { PositionalDropoffChart, DropoffPlayer } from '@/components/redraft/PositionalDropoffChart';

export const dynamic = 'force-dynamic';

const TARGET_SEASON = 2026;

export const metadata: Metadata = {
    title: 'Positional Dropoff | Redraft | DyCharts',
    description:
        'Projected points by positional rank, so you can see where each position falls off '
        + 'a cliff and time your picks around it.',
};

/**
 * Projected points per player, ranked within their position.
 *
 * Ranking happens here rather than in SQL so the order is by the same averaged
 * projection the chart plots — ordering by consensus rank instead would draw a
 * curve that disagreed with its own y-axis.
 */
const PROJECTION_SQL = `
  SELECT p.slug, p.full_name, p.position, p.nfl_team,
         AVG(pr.proj_points) AS proj_points
  FROM players p
  JOIN projections pr ON pr.player_id = p.id AND pr.season = $1
  WHERE p.redraft_pool = 1 AND pr.proj_points IS NOT NULL
  GROUP BY p.slug, p.full_name, p.position, p.nfl_team
  ORDER BY proj_points DESC
`;

async function getPlayers(): Promise<DropoffPlayer[]> {
    const rows = await query<{
        slug: string; full_name: string; position: string;
        nfl_team: string | null; proj_points: number;
    }>(PROJECTION_SQL, [TARGET_SEASON]);

    const seen: Record<string, number> = {};
    return rows.map(r => {
        const pos = (r.position || '').toUpperCase();
        seen[pos] = (seen[pos] ?? 0) + 1;
        return {
            slug: r.slug,
            full_name: r.full_name,
            position: pos,
            nfl_team: r.nfl_team,
            proj_points: Number(r.proj_points),
            pos_rank: seen[pos],
        };
    });
}

export default async function DropoffPage() {
    let players: DropoffPlayer[] = [];
    try {
        players = await getPlayers();
    } catch (e) {
        console.error('Failed to load projection curves:', e);
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />

            <main className="w-full px-3 sm:px-8 lg:px-12 py-5 sm:py-7 mx-auto max-w-7xl space-y-5">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Positional Dropoff</h1>
                    <p className="text-[13px] text-muted-foreground mt-1 max-w-3xl">
                        Where each position falls off a cliff, and where it does not. A steep line
                        means the next man is meaningfully worse and waiting is expensive; a flat one
                        means you can spend the pick elsewhere and come back later.
                    </p>
                </div>

                {players.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                        No {TARGET_SEASON} projections loaded yet. Run{' '}
                        <code className="text-foreground">py -m scrapers.redraft.daily_redraft_update</code>{' '}
                        to populate them.
                    </div>
                ) : (
                    <PositionalDropoffChart players={players} />
                )}
            </main>
        </div>
    );
}
