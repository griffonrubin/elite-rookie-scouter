import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { TeamClient } from '@/components/redraft/team/TeamClient';
import { REDRAFT_BOARD_SQL } from '@/lib/redraftBoardQuery';
import { query } from '@/lib/db';
import { RedraftPlayer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Team Analysis | In Season | DyCharts',
    description:
        'What each of your starters is actually worth to you — the gap between him '
        + 'and whoever would replace him, measured by removing him and replaying the '
        + 'league.',
};

export default async function TeamPage() {
    const players = await query<RedraftPlayer>(REDRAFT_BOARD_SQL);
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1500px] mx-auto px-3 sm:px-5 py-4">
                <TeamClient players={players} />
            </main>
        </div>
    );
}
