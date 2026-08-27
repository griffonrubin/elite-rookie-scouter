import { TierBuilder } from '@/components/TierBuilder';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = "force-dynamic";

export default function RedraftTiersPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />
            <main className="w-full px-3 sm:px-8 lg:px-12 py-4 sm:py-6 mx-auto">
                <TierBuilder
                    mode="redraft"
                    playersApi="/api/redraft/players?limit=400"
                    positions={['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']}
                    accent="sky"
                />
            </main>
        </div>
    );
}
