import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { WaiversClient } from '@/components/redraft/waivers/WaiversClient';
import { REDRAFT_BOARD_SQL } from '@/lib/redraftBoardQuery';
import { query } from '@/lib/db';
import { RedraftPlayer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Waiver Wire | In Season | DyCharts',
    description:
        'Free agents in your own league, ranked by whether their role is growing '
        + 'rather than by a projection made in August — with the snaps, touches '
        + 'and injury behind each one.',
};

export default async function WaiversPage() {
    // The whole pool: the league sync hands back platform ids that have to be
    // matched against all of them to work out who is actually taken.
    const players = await query<RedraftPlayer>(REDRAFT_BOARD_SQL);
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1500px] mx-auto px-3 sm:px-5 py-4">
                <WaiversClient players={players} />
            </main>
        </div>
    );
}
