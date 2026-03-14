'use client';

import { LayoutList, LayoutGrid, Hexagon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'table' | 'box' | 'hex';

interface ViewModeSelectorProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

const VIEWS: { value: ViewMode; icon: React.ElementType; label: string }[] = [
    { value: 'table', icon: LayoutList, label: 'List view' },
    { value: 'box', icon: LayoutGrid, label: 'Card view' },
    { value: 'hex', icon: Hexagon, label: 'Compact view' },
];

export function ViewModeSelector({ mode, onChange }: ViewModeSelectorProps) {
    return (
        <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1">
            {VIEWS.map(({ value, icon: Icon, label }) => {
                const active = mode === value;
                return (
                    <button
                        key={value}
                        type="button"
                        aria-label={label}
                        onClick={() => onChange(value)}
                        className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150',
                            active
                                ? 'bg-primary/20 text-primary shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                );
            })}
        </div>
    );
}
