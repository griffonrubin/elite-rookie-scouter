import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { TradeCalculator } from '@/components/dynasty/TradeCalculator';
import { loadDynastyAssets } from '@/lib/dynastyAssets';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Trade Calculator | Dynasty | DyCharts',
    description:
        'Price a dynasty trade from market values — any player, any pick, '
        + 'either format, without connecting a league or picking a team.',
};

export default async function TradeCalculatorPage() {
    const assets = await loadDynastyAssets();
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1100px] mx-auto px-3 sm:px-5 py-4">
                <TradeCalculator assets={assets} />
            </main>
        </div>
    );
}
