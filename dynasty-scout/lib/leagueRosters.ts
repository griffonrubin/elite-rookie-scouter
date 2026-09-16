/**
 * A synced league, resolved to our own player ids.
 *
 * Extracted because two pages now need the identical answer and a second
 * copy of it is a number that disagrees with itself. The Power page ranks
 * these rosters and the Start/Sit page asks what one Sunday is worth to
 * the season those rosters are playing — and if the two build their
 * leagues even slightly differently, one page says a week is worth
 * twenty-three points of playoff odds while the other says twenty-four,
 * with no way for a reader to know which to believe.
 */
import type { LeagueSnapshot, LeaguePlatform } from '@/lib/useLeagueSync';
import { BENCH_SLOTS } from '@/lib/useLeagueSync';
import type { TradeRosterPlayer } from '@/lib/trade';
import type { RedraftPlayer } from '@/lib/types';

export interface LeagueRoster {
    key: string;
    name: string;
    /** The starting lineup, as our ids, in slot order with holes removed. */
    ids: number[];
    /** Every player on the roster, which is what the rest of a season uses. */
    roster: TradeRosterPlayer[];
    /** Roster entries we could not match to a player of ours. */
    unmatched: number;
    /**
     * Three counts, because they come apart: slots the format gives
     * everyone, players the owner has put in them, and players we managed
     * to price. A team starting eight of nine is a fact about that team;
     * eight of nine priced is a fact about us.
     */
    filled: number;
    slots: number;
    record?: LeagueSnapshot['teams'][number]['record'];
}

/** Where the lineup slots come from when the platform will not say. */
export const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

/**
 * Every team's lineup and its whole roster.
 *
 * Both, because the two horizons want different ones. This week the lineup
 * an owner has actually set is the lineup they will field, holes and
 * mistakes included. Over the rest of the season it is not: the flex they
 * left empty in week one will not be empty in week nine, and ranking a
 * roster below a worse one because somebody forgot to set it this Sunday
 * is a fact about one afternoon.
 */
export function leagueRosters(
    snapshot: LeagueSnapshot | null,
    players: RedraftPlayer[],
    platform: LeaguePlatform | null | undefined,
): LeagueRoster[] | null {
    if (!snapshot) return null;
    const byPlatformId = new Map(players.map(p => [
        String(platform === 'espn' ? p.espn_nfl_id : p.sleeper_id), p]));
    return snapshot.teams.map(t => {
        const lineup = t.lineupSlots?.length
            ? t.lineupSlots.map(s => s.playerId)
            : t.slots.filter(s => s.starting).map(s => s.playerId);
        const filled = lineup.filter((pid): pid is string => !!pid);
        const ids = filled
            .map(pid => byPlatformId.get(String(pid))?.id ?? null)
            .filter((id): id is number => id != null);
        const roster: TradeRosterPlayer[] = [];
        let unmatched = 0;
        for (const s of t.slots) {
            const hit = byPlatformId.get(String(s.playerId));
            if (!hit) { unmatched++; continue; }
            roster.push({
                id: hit.id,
                name: hit.full_name ?? String(hit.id),
                position: hit.position ?? '',
                startable: true,
            });
        }
        return {
            key: t.key, name: t.name, ids, roster, unmatched,
            filled: filled.length, slots: lineup.length, record: t.record,
        };
    });
}

/** The startable slots this league fields, which decide replacement level. */
export function lineupSlotsOf(snapshot: LeagueSnapshot | null): string[] {
    const rp = snapshot?.rosterPositions;
    if (!rp?.length) return DEFAULT_SLOTS;
    return rp.filter(s => !BENCH_SLOTS.has(s.toUpperCase()));
}

/** Every player id in the league, which is what a league-wide fetch wants. */
export function idsIn(teams: LeagueRoster[] | null): number[] {
    const ids = new Set<number>();
    for (const t of teams ?? []) {
        for (const id of t.ids) ids.add(id);
        for (const p of t.roster) ids.add(p.id);
    }
    return [...ids];
}
