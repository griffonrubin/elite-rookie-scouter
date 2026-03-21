import { TierBuilder } from '@/components/TierBuilder';
import { Layers, Zap } from 'lucide-react';
import Link from 'next/link';

export const dynamic = "force-dynamic";

export default function TierBuilderPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border/60 bg-card/60 backdrop-blur-md sticky top-0 z-50">
                <div className="w-full px-8 sm:px-12 h-14 flex items-center justify-between mx-auto">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                            <Zap className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
                        </div>
                        <Link href="/" className="font-bold text-base tracking-tight text-foreground hover:text-primary transition-colors">
                            Elite Rookie Scouter
                        </Link>
                        <span className="text-xs text-muted-foreground font-medium hidden sm:block">/ Tier Builder</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                        <Link href="/" className="hover:text-foreground transition-colors font-semibold">Board</Link>
                        <Link href="/compare" className="hover:text-foreground transition-colors font-semibold">Compare</Link>
                        <span className="text-foreground font-semibold flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5" /> Tier Builder
                        </span>
                    </div>
                </div>
            </header>
            <main className="w-full px-8 sm:px-12 py-6 mx-auto">
                <TierBuilder />
            </main>
        </div>
    );
}
