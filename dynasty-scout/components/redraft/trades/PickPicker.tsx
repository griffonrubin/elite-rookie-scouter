'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import { PROJECTION_MIN_GAMES, pickName, type PickAsset } from '@/lib/tradePicks';

/** How a projected band reads on a chip. */
const SLOT_LABEL: Record<string, string> = {
    early: 'early', mid: 'mid', late: 'late',
};

/**
 * The draft picks a team holds, as things you can put in the trade.
 *
 * Deliberately a separate list from the roster rather than another position
 * group inside it, because a pick is not the same kind of asset and the page
 * must not let it look like one. Everything in the roster list has an
 * expected-points number and changes this season; nothing here does. Mixing
 * them would invite the reading that the simulation priced the pick.
 *
 * What each one is worth is the market's number, not ours, and the original
 * owner's record is beside it because that is the fact the market's number
 * does not know. "2027 1st" from the 2-8 team and "2027 1st" from the 8-2
 * team carry the same price here and are a rookie apart in reality, and a
 * reader who can see both records can make that adjustment themselves.
 */
export function PickPicker({
    picks, selected, onToggle, disabled, unknownOwnership,
}: {
    picks: PickAsset[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    disabled?: boolean;
    /**
     * True where the platform never said who holds what, so these are each
     * team's own picks by assumption. Said on the panel rather than hidden,
     * because a reader whose league has traded picks needs to know the list
     * is a default and not a reading.
     */
    unknownOwnership?: boolean;
}) {
    if (picks.length === 0) {
        return (
            <p className="text-[10px] text-muted-foreground/40 mt-2">
                No future picks — every pick this team owned has been traded away.
            </p>
        );
    }

    const bySeason = [...new Set(picks.map(p => p.season))].sort((a, b) => a - b);
    const anyProjected = picks.some(p => p.projection != null);

    return (
        <div className="mt-2 pt-2 border-t border-white/[0.06]">
            <div className="text-[9px] uppercase tracking-widest font-bold
                            text-muted-foreground/35 mb-1">
                Draft picks
            </div>
            {bySeason.map(season => (
                <div key={season} className="mb-1 last:mb-0">
                    <ul className="flex flex-wrap gap-1">
                        {picks.filter(p => p.season === season).map(p => {
                            const on = selected.has(p.id);
                            const theirs = p.fromKey !== p.ownerKey;
                            // A record of nothing tells a reader nothing. In
                            // week one every team in the league is 0-0, and
                            // thirteen chips each carrying it is thirteen
                            // pieces of furniture in front of the values.
                            const played = p.fromRecord
                                ? p.fromRecord.wins + p.fromRecord.losses
                                  + p.fromRecord.ties
                                : 0;
                            const rec = played > 0 ? p.fromRecord : null;
                            const proj = p.projection;
                            return (
                                <li key={p.id}>
                                    <button type="button" disabled={disabled}
                                        aria-pressed={on}
                                        data-pick-id={p.id}
                                        onClick={() => onToggle(p.id)}
                                        title={[
                                            pickName(p),
                                            p.value == null
                                                ? 'No market price for this one — it is '
                                                  + 'further out than the feed goes, so '
                                                  + 'the totals say it is missing'
                                                : `Market value ${p.value.toLocaleString()}`,
                                            proj
                                                ? `Projected pick ${proj.pick} of `
                                                  + `${proj.teams} — ${proj.slot}. `
                                                  + `Its owner is `
                                                  + (rec ? `${rec.wins}-${rec.losses}`
                                                      + `${rec.ties ? `-${rec.ties}` : ''}, `
                                                      : '')
                                                  + `${proj.recordRank} of ${proj.teams} on `
                                                  + `record and ${proj.pointsRank} on `
                                                  + `points scored, blended `
                                                  + `${Math.round(proj.recordWeight * 100)}`
                                                  + `% record as that is how much of the `
                                                  + `season has been played`
                                                : rec
                                                    ? `Belongs to a team currently `
                                                      + `${rec.wins}-${rec.losses}`
                                                      + `${rec.ties ? `-${rec.ties}` : ''}`
                                                      + ` — the worse their season, the `
                                                      + `earlier this pick lands`
                                                    : null,
                                        ].filter(Boolean).join(' · ')}
                                        className={cn(`text-[10px] rounded-lg px-1.5 py-1
                                            border transition-colors text-left
                                            disabled:opacity-40 disabled:cursor-default`,
                                            on
                                                ? 'bg-white/[0.10] border-white/25'
                                                : 'border-white/10 hover:bg-white/[0.05]')}
                                        style={on
                                            ? { boxShadow: `inset 2px 0 0 ${DIVERGING.positive}` }
                                            : undefined}>
                                        <span className={cn('tabular-nums',
                                            on ? 'font-bold' : 'font-semibold')}>
                                            {p.season} {p.label}
                                        </span>
                                        {theirs && p.fromName && (
                                            <span className="text-muted-foreground/45 ml-1">
                                                ex {p.fromName.length > 12
                                                    ? `${p.fromName.slice(0, 11)}…`
                                                    : p.fromName}
                                            </span>
                                        )}
                                        {/* The band, where there is one, because
                                            it is what the price beside it is
                                            now made of. The record stays when
                                            there is no projection: it is the
                                            raw fact the reader can still use. */}
                                        {proj ? (
                                            <span className="ml-1"
                                                style={{ color: proj.slot === 'early'
                                                    ? DIVERGING.positive
                                                    : proj.slot === 'late'
                                                        ? 'rgba(255,255,255,0.3)'
                                                        : 'rgba(255,255,255,0.45)' }}>
                                                {SLOT_LABEL[proj.slot] ?? proj.slot}
                                                <span className="text-muted-foreground/30
                                                                 tabular-nums ml-0.5">
                                                    ~{proj.pick}
                                                </span>
                                            </span>
                                        ) : rec ? (
                                            <span className="text-muted-foreground/35 ml-1
                                                             tabular-nums">
                                                {rec.wins}-{rec.losses}
                                            </span>
                                        ) : null}
                                        <span className="text-muted-foreground/55 ml-1
                                                         tabular-nums">
                                            {p.value == null
                                                ? '—'
                                                : p.value.toLocaleString()}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
            <p className="text-[9px] text-muted-foreground/30 mt-1.5">
                Market value, not a projection of this season — a pick does not play,
                so it cannot move the playoff odds below, and the panel under the
                verdict totals it separately.
                {anyProjected ? ' Picks in the next draft are priced at their '
                    + 'projected band: the league is ranked on a weighted average of '
                    + 'record and points scored, the record carrying the share of the '
                    + 'regular season already played, and the draft read in reverse so '
                    + 'the worst team picks first. It is a projection and it will move '
                    + '\u2014 an early first is worth nearly double a late one, so the '
                    + 'band is doing most of the work in these numbers. Later drafts '
                    + 'keep the market\u2019s unslotted price, because the roster that '
                    + 'pick belongs to does not exist yet.'
                    : ` Bands are not projected until game ${PROJECTION_MIN_GAMES}: `
                      + 'an early first is worth nearly double a late one, and putting '
                      + 'that on three games would be guessing with a multiplier. '
                      + 'Until then every pick carries the market\u2019s unslotted '
                      + 'price, which is what that price is for.'}
                {unknownOwnership && ' Your platform does not report which picks have '
                    + 'been traded, so these are each team’s own picks. Where your '
                    + 'league has moved some, read this list with that in mind.'}
                {' '}Where a season is under way, the record beside a pick is the
                record of the team it belongs to — the worse they are doing, the
                earlier the pick lands.
            </p>
        </div>
    );
}
