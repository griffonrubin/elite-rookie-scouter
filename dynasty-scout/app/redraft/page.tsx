import { AppHeader } from '@/components/AppHeader';
import { Database, ListOrdered, LineChart, Users } from 'lucide-react';

export const dynamic = "force-dynamic";

const PIPELINE = [
    { icon: Database,    label: 'Player pool',  detail: 'All draftable NFL players + K and D/ST' },
    { icon: LineChart,   label: 'NFL stats',    detail: 'PPR points and positional finishes, 2021–2025' },
    { icon: ListOrdered, label: 'Rankings',     detail: '8-source consensus, PPR redraft' },
    { icon: Users,       label: 'Projections',  detail: '2026 outlooks compared across sources' },
];

export default function RedraftPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />
            <main className="w-full px-3 sm:px-8 lg:px-12 py-10 sm:py-16 mx-auto max-w-4xl">
                <div className="text-center">
                    <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        Building
                    </span>
                    <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
                        Redraft Board
                    </h1>
                    <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
                        Seasonal PPR rankings for every draftable player, with the same
                        data-first treatment as the rookie board. Data pipeline is being wired up now.
                    </p>
                </div>

                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                    {PIPELINE.map(({ icon: Icon, label, detail }) => (
                        <div
                            key={label}
                            className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]"
                        >
                            <div className="p-2 rounded-lg bg-sky-500/10 shrink-0">
                                <Icon className="w-4 h-4 text-sky-400" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">{label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
