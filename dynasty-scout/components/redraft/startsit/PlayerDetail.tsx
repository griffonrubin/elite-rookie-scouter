'use client';

import React from 'react';
import { Outcome } from '@/lib/startSit';
import type { GameLog } from '@/app/api/redraft/startsit/route';
import { WhyBars, WhyBarsProps } from './WhyBars';
import { UsageStrip } from './UsageStrip';
import { GameLogTable } from './GameLogTable';

/**
 * One player's week, at one depth, wherever they appear.
 *
 * The reasoning behind a number is not more interesting for a starter than
 * for the man who might replace him, or for the receiver on the other side
 * of the matchup who is about to decide your week. Keeping this in one place
 * is what stops the page from having a good answer in the slot board and a
 * worse one three panels down.
 */
export interface PlayerDetailProps {
    outcome: Outcome;
    context?: WhyBarsProps['context'];
    logs?: GameLog[];
    position?: string | null;
    /** Stack instead of sitting side by side, for a narrow column. */
    stacked?: boolean;
}

export function PlayerDetail({
    outcome, context, logs = [], position, stacked = false,
}: PlayerDetailProps) {
    return (
        <div className={stacked
            ? 'space-y-2.5'
            : `grid gap-x-6 gap-y-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]`}>
            <WhyBars outcome={outcome} context={{ ...context, position }} />
            {/* Beside the arithmetic, not under it: "the number says 16.9"
                and "his carries are down six" are two halves of one
                question. */}
            <UsageStrip logs={logs} position={position} />
            {/* The rows every summary above is a compression of. Folded away,
                because most weeks the summary is enough and the moment it is
                not is the moment you want all of them. */}
            <div className={stacked ? '' : 'lg:col-span-2'}>
                <GameLogTable logs={logs} position={position} />
            </div>
        </div>
    );
}
