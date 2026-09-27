'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import { pickName, type PickAsset } from '@/lib/tradePicks';

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
                                            rec
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
                                        {rec && (
                                            <span className="text-muted-foreground/35 ml-1
                                                             tabular-nums">
                                                {rec.wins}-{rec.losses}
                                            </span>
                                        )}
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
