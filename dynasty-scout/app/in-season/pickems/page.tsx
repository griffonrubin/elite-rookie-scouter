import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { PickemsClient } from '@/components/redraft/pickems/PickemsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: "Pick'ems | In Season | DyCharts",
    description:
        'Every game every week with its spread, total and de-vigged market price — '
        + 'beside what a line that size has actually done across twenty-seven seasons.',
};

export default function PickemsPage() {
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            <AppHeader />
            <main className="max-w-[1500px] mx-auto px-3 sm:px-5 py-4">
                <PickemsClient />
            </main>
        </div>
    );
}
