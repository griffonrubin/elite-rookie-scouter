'use client';

import { cn } from '@/lib/utils';

/**
 * Displays an NFL team logo from ESPN CDN.
 * Works with standard abbreviations: ARI, ATL, BAL, BUF, CAR, CHI, CIN, CLE,
 * DAL, DEN, DET, GB, HOU, IND, JAX, KC, LAC, LAR, LV, MIA, MIN, NE, NO,
 * NYG, NYJ, PHI, PIT, SEA, SF, TB, TEN, WAS
 */
interface NflTeamLogoProps {
    abbr: string | null | undefined;
    size?: number;
    className?: string;
}

export function NflTeamLogo({ abbr, size = 16, className }: NflTeamLogoProps) {
    if (!abbr) return null;
    const src = `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
    return (
        <img
            src={src}
            alt={abbr}
            width={size}
            height={size}
            className={cn('object-contain flex-shrink-0', className)}
            style={{ width: size, height: size }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
    );
}

/**
 * Returns the draft status for a player as a structured object.
 * Used to display the correct badge/label across all views.
 */
export type DraftStatus =
    | { type: 'drafted'; slot: string; team: string }
    | { type: 'udfa';    team: string }
    | { type: 'undrafted' };

export function getDraftStatus(player: {
    draft_round?: number | null;
    draft_pick?: number | null;
    nfl_team?: string | null;
}): DraftStatus {
    if (player.draft_round != null && player.draft_pick != null) {
        return {
            type: 'drafted',
            slot: `${player.draft_round}.${String(player.draft_pick).padStart(2, '0')}`,
            team: player.nfl_team ?? '',
        };
    }
    if (player.nfl_team) {
        return { type: 'udfa', team: player.nfl_team };
    }
    return { type: 'undrafted' };
}
