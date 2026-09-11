import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { StartSitClient } from '@/components/redraft/startsit/StartSitClient';
import { REDRAFT_BOARD_SQL } from '@/lib/redraftBoardQuery';
import { query } from '@/lib/db';
import { RedraftPlayer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Start/Sit | Redraft | DyCharts',
    description:
        'Start/sit decisions scored by what they do to your chance of winning the week, '
        + 'not just to your projected total — with each player’s outcomes drawn as a '
        + 'distribution rather than a single number.',
};

export default async function StartSitPage() {
    // The whole pool, because a lineup can contain anyone and the league sync
    // hands back platform ids that have to be matched against all of them.
    const players = await query<RedraftPlayer>(REDRAFT_BOARD_SQL);
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1500px] mx-auto px-3 sm:px-5 py-4">
                <StartSitClient players={players} />
            </main>
        </div>
    );
}
