import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { PowerClient } from '@/components/redraft/power/PowerClient';
import { REDRAFT_BOARD_SQL } from '@/lib/redraftBoardQuery';
import { query } from '@/lib/db';
import { RedraftPlayer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Power Rankings | In Season | DyCharts',
    description:
        'Every roster in your league played against every other one, ranked on how '
        + 'often it wins rather than on what it has scored — with the gap between '
        + 'a team’s strength and its record.',
};

export default async function PowerPage() {
    const players = await query<RedraftPlayer>(REDRAFT_BOARD_SQL);
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1500px] mx-auto px-3 sm:px-5 py-4">
                <PowerClient players={players} />
            </main>
        </div>
    );
}
