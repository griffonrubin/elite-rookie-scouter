import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { TradeClient } from '@/components/redraft/trades/TradeClient';
import { REDRAFT_BOARD_SQL } from '@/lib/redraftBoardQuery';
import { query } from '@/lib/db';
import { loadTradePrices } from '@/lib/tradePrices';
import { RedraftPlayer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Trade Analyzer | In Season | DyCharts',
    description:
        'A trade judged on what it does rather than what it is worth: both lineups '
        + 're-filled from the best available players, the whole league replayed, and '
        + 'the change in how often each side wins.',
};

export default async function TradesPage() {
    // Together rather than in sequence: neither needs the other, and the
    // page cannot paint until both are home.
    const [players, prices] = await Promise.all([
        query<RedraftPlayer>(REDRAFT_BOARD_SQL),
        loadTradePrices(),
    ]);
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1500px] mx-auto px-3 sm:px-5 py-4">
                <TradeClient players={players} prices={prices} />
            </main>
        </div>
    );
}
