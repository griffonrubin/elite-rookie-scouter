import { query } from '@/lib/db';
import { redraftBoardSqlLimited } from '@/lib/redraftBoardQuery';
import { AppHeader } from '@/components/AppHeader';
import { MockDraftClient } from '@/components/redraft/mock/MockDraftClient';
import { RedraftPlayer } from '@/lib/types';

export const dynamic = "force-dynamic";

/**
 * Consensus top 600 — enough for the 320 picks a 16-team, 20-round draft can
 * need plus browsing depth, and it covers every D/ST (ranks 218-437) and
 * kickers from 206. Loading all 1332 would only make the draft room sluggish.
 */
const POOL_SIZE = 600;

async function getPool(): Promise<RedraftPlayer[]> {
    try {
        const rows = await query<RedraftPlayer>(redraftBoardSqlLimited(POOL_SIZE), []);
        return rows.map((p, i) => ({ ...p, board_rank: i + 1 }));
    } catch (e) {
        console.error('Failed to load mock draft pool:', e);
        return [];
    }
}

export default async function MockDraftPage() {
    const players = await getPool();

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />
            <main className="w-full px-3 sm:px-8 lg:px-12 py-4 sm:py-6 mx-auto">
                <div className="mb-4">
                    <h1 className="text-xl font-bold tracking-tight">Mock Draft</h1>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                        Practise from any slot against opponents drafting off different ranking
                        sources — so you find out who actually falls to you.
                    </p>
                </div>

                {players.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                        No redraft players available. Run the redraft pipeline first.
                    </div>
                ) : (
                    <MockDraftClient players={players} />
                )}
            </main>
        </div>
    );
}
