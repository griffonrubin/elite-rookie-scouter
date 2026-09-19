import { query, queryOne } from '@/lib/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
    NflAdvancedSeason, NflSeasonStat, Projection, RedraftPlayer,
    VegasGameLine, VegasTeamSeason,
} from '@/lib/types';
import { RedraftProfileClient } from '@/components/redraft/RedraftProfileClient';
import { durabilityOf, type Durability } from '@/lib/durability';
import { redraftRankHistory } from '@/lib/rankHistory';
import { loadAttendance } from '@/lib/attendance';
import { contingencyFor, inheritanceIndex, notable, type WeekRow } from '@/lib/successor';

export const dynamic = "force-dynamic";

/** The season the redraft board is being built for. */
const TARGET_SEASON = 2026;

/**
 * How far back the availability window reaches.
 *
 * The same three seasons the successor measurement uses, so a reader moving
 * between this page and Team Analysis is not told two different numbers
 * about the same absences.
 */
const FROM_SEASON = TARGET_SEASON - 2;

/** Weekly logs for one NFL team, which is all the absence work needs. */
const TEAM_WEEKS_SQL = `
  SELECT w.player_id, p.full_name, w.position, w.team, w.season, w.week,
         w.fantasy_points_ppr AS points,
         CASE WHEN w.position = 'QB'
              THEN COALESCE(w.pass_attempts, 0) + COALESCE(w.carries, 0)
              ELSE COALESCE(w.carries, 0) + COALESCE(w.targets, 0)
         END AS touches
    FROM nfl_player_week w
    JOIN players p ON p.id = w.player_id
   WHERE w.season_type = 'REG'
     AND w.season BETWEEN ${FROM_SEASON} AND ${TARGET_SEASON}
     AND UPPER(w.team) = $1
   ORDER BY w.season, w.week
`;

export interface ProfileAvailability {
    durability: Durability;
    from: number;
    to: number;
    /** Who was measured taking his work, where anybody was. */
    successors: {
        id: number; name: string; slug: string | null;
        games: number; pointsOut: number; lift: number | null; absorbed: number | null;
    }[];
    /** And whose work he was measured taking, if he is the one behind somebody. */
    covers: {
        id: number; name: string; slug: string | null;
        missed: number; played: number; points: number;
        games: number; pointsOut: number; absorbed: number | null;
    }[];
}

interface PageProps {
    params: Promise<{ slug: string }>;
}

const PLAYER_SQL = `
  SELECT
    p.id, p.slug, p.full_name, p.position, p.nfl_team, p.dob,
    p.height_inches, p.weight_lbs, p.years_exp, p.nfl_draft_year,
    p.draft_year, p.nfl_headshot_url, p.headshot_url, p.espn_college_id,
    t.logo_url AS team_logo, t.full_name AS team_name,
    t.primary_color AS team_color,
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

async function getPlayer(slug: string) {
    const player = await queryOne<any>(PLAYER_SQL, [slug]);
    if (!player) return null;

    const seasons = await query<NflSeasonStat>(
        `SELECT * FROM nfl_season_stats WHERE player_id = $1 ORDER BY season DESC`,
        [player.id]
    );

    // Both placeholders are numbered and bound separately: Postgres is happy
    // either way, but lib/db.ts rewrites every $N to a positional ? for local
    // SQLite, where a reused $1 needs a second value or the query throws.
    const sourceRanks = await query<{ source: string; rank_overall: number; rank_positional: number | null; tier: number | null }>(
        `SELECT r.source, r.rank_overall, r.rank_positional, r.tier
         FROM rankings r
         JOIN (
           SELECT source, MAX(scraped_at) AS md
           FROM rankings WHERE player_id = $1 GROUP BY source
         ) l ON l.source = r.source AND r.scraped_at = l.md
         WHERE r.player_id = $2 AND r.rank_overall IS NOT NULL
         ORDER BY r.rank_overall ASC`,
        [player.id, player.id]
    );

    const projections = await query<Projection>(
        `SELECT pr.* FROM projections pr
         JOIN (
           SELECT source, MAX(scraped_at) AS md
           FROM projections WHERE player_id = $1 AND season = $2 GROUP BY source
         ) lp ON lp.source = pr.source AND pr.scraped_at = lp.md
         WHERE pr.player_id = $3 AND pr.season = $4
         ORDER BY pr.proj_points DESC NULLS LAST`,
        [player.id, TARGET_SEASON, player.id, TARGET_SEASON]
    );

    const advanced = await query<NflAdvancedSeason>(
        `SELECT * FROM nfl_advanced_season WHERE player_id = $1 ORDER BY season DESC`,
        [player.id]
    );

    // Percentiles are only meaningful against the same position in the same
    // season, so pull the whole field for the seasons this player actually has.
    const peers = advanced.length
        ? await query<NflAdvancedSeason>(
            `SELECT * FROM nfl_advanced_season
             WHERE position = $1 AND season IN (${advanced.map((_, i) => `$${i + 2}`).join(', ')})`,
            [player.position, ...advanced.map(a => a.season)]
        )
        : [];
    const peersBySeason: Record<number, NflAdvancedSeason[]> = {};
    for (const row of peers) {
        (peersBySeason[row.season] ??= []).push(row);
    }

    const vegasTeam = player.nfl_team
        ? await queryOne<VegasTeamSeason>(
            `SELECT * FROM vegas_team_season WHERE season = $1 AND team = $2`,
            [TARGET_SEASON, player.nfl_team]
        ) ?? null
        : null;

    const vegasSchedule = player.nfl_team
        ? await query<VegasGameLine>(
            `SELECT * FROM vegas_game_lines
             WHERE season = $1 AND team = $2 ORDER BY week ASC`,
            [TARGET_SEASON, player.nfl_team]
        )
        : [];

    const teamLogos = await query<{ abbreviation: string; logo_url: string | null }>(
        `SELECT abbreviation, logo_url FROM nfl_teams`,
        []
    );
    const logos: Record<string, string> = {};
    for (const t of teamLogos) {
        if (t.logo_url) logos[t.abbreviation] = t.logo_url;
    }

    /**
     * Availability, in both directions.
     *
     * His own attendance against his position, who covered for him, and —
     * for a backup, where the interesting answer is — whose absence he was
     * measured covering. A reader arriving here from the waiver wire clicked
     * a line that said one of those things; the page should not then be
     * silent about it.
     */
    let availability: ProfileAvailability | null = null;
    try {
        const team = (player.nfl_team ?? '').toUpperCase();
        const [rows, weekRows] = await Promise.all([
            loadAttendance(FROM_SEASON, TARGET_SEASON),
            team ? query<WeekRow>(TEAM_WEEKS_SQL, [team]) : Promise.resolve([]),
        ]);
        const mine = rows.find(r => r.playerId === Number(player.id));
        if (mine) {
            const contingency = weekRows.length
                ? contingencyFor(Number(player.id), weekRows) : null;
            const index = weekRows.length ? inheritanceIndex(weekRows) : null;
            const named = [
                ...(contingency?.successors ?? []).filter(notable).map(s => s.id),
                ...(index?.get(Number(player.id)) ?? []).map(i => i.fromId),
            ];
            // Where everyone named plays now, which the game logs cannot say.
            const whereNow = new Map<number, { slug: string | null; team: string | null }>();
            if (named.length) {
                const found = await query<{ id: number; slug: string | null; nfl_team: string | null }>(
                    `SELECT id, slug, nfl_team FROM players WHERE id IN (${[...new Set(named)].join(',')})`,
                    []);
                for (const f of found) {
                    whereNow.set(Number(f.id), { slug: f.slug, team: f.nfl_team?.toUpperCase() ?? null });
                }
            }
            const here = (id: number) => whereNow.get(id)?.team === team;
            availability = {
                durability: durabilityOf(mine, rows),
                from: FROM_SEASON, to: TARGET_SEASON,
                successors: (contingency?.successors ?? []).filter(notable)
                    .filter(s => here(s.id))
                    .map(s => ({
                        id: s.id, name: s.name, slug: whereNow.get(s.id)?.slug ?? null,
                        games: s.games, pointsOut: s.pointsOut,
                        lift: s.lift, absorbed: s.absorbed,
                    })),
                covers: (index?.get(Number(player.id)) ?? [])
                    .filter(i => here(i.fromId))
                    .map(i => ({
                        id: i.fromId, name: i.fromName,
                        slug: whereNow.get(i.fromId)?.slug ?? null,
                        missed: i.fromMissed, played: i.fromPlayed, points: i.fromPoints,
                        games: i.as.games, pointsOut: i.as.pointsOut, absorbed: i.as.absorbed,
                    })),
            };
        }
    } catch (e) {
        // Availability is an addition to the page, not the page. A failure
        // here must not take the production tables down with it.
        console.error('Failed to measure availability:', e);
    }

    // Prev / next by board order, so the profile can page through the board.
    const ordered = await query<{ slug: string; full_name: string }>(
        `SELECT p.slug, p.full_name
         FROM players p
         LEFT JOIN consensus_rankings c
           ON c.player_id = p.id AND c.format = 'REDRAFT'
          AND c.calculated_at = (
            SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
          )
         WHERE p.redraft_pool = 1
         ORDER BY c.rank_overall ASC NULLS LAST, p.id ASC`,
        []
    );
    const idx = ordered.findIndex(o => o.slug === slug);

    // Every consensus the board has ever computed for him, so the profile
    // can show which way he has been going and not just where he sits.
    const rankHistory = await redraftRankHistory(player.id);

    return {
        player: player as RedraftPlayer & Record<string, any>,
        seasons,
        sourceRanks,
        rankHistory,
        projections,
        advanced,
        peersBySeason,
        vegasTeam,
        vegasSchedule,
        logos,
        availability,
        boardRank: idx >= 0 ? idx + 1 : null,
        prev: idx > 0 ? ordered[idx - 1] : null,
        next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null,
    };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const data = await getPlayer(slug).catch(() => null);
    if (!data) return { title: 'Player not found | DyCharts' };
    const { player } = data;
    const pos = player.position;
    return {
        title: `${player.full_name} — ${pos} ${player.nfl_team ?? 'FA'} | Redraft | DyCharts`,
        description: `${TARGET_SEASON} PPR redraft profile for ${player.full_name}: rankings, projections, Vegas lines and advanced NFL production 2021-2025.`,
    };
}

export default async function RedraftPlayerPage({ params }: PageProps) {
    const { slug } = await params;
    let data;
    try {
        data = await getPlayer(slug);
    } catch (e) {
        console.error('Failed to load redraft player:', e);
        data = null;
    }
    if (!data) notFound();

    return (
        <RedraftProfileClient
            player={data.player}
            seasons={data.seasons}
            sourceRanks={data.sourceRanks}
            rankHistory={data.rankHistory}
            projections={data.projections}
            advanced={data.advanced}
            peersBySeason={data.peersBySeason}
            vegasTeam={data.vegasTeam}
            vegasSchedule={data.vegasSchedule}
            teamLogos={data.logos}
            season={TARGET_SEASON}
            availability={data.availability}
            boardRank={data.boardRank}
            prev={data.prev}
            next={data.next}
        />
    );
}
