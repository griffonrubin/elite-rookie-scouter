import { TierBuilder } from '@/components/TierBuilder';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = "force-dynamic";

export default function TierBuilderPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader />
            <main className="w-full px-3 sm:px-8 lg:px-12 py-4 sm:py-6 mx-auto">
                <TierBuilder />
            </main>
        </div>
    );
}
