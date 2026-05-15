'use client';

import { cn } from '@/lib/utils';
import { BoardDataset } from '@/lib/boardColumns';

interface DatasetPickerProps {
    dataset: BoardDataset;
    onChange: (dataset: BoardDataset) => void;
}

const DATASETS: { value: BoardDataset; label: string; hint: string }[] = [
    { value: 'snapshot',   label: 'Snapshot',   hint: 'Position-aware overview' },
    { value: 'rankings',   label: 'Rankings',   hint: 'Source ranks + consensus' },
    { value: 'traits',     label: 'Traits',     hint: 'Athletic measurables' },
    { value: 'production', label: 'Production', hint: 'College stats' },
];

export function DatasetPicker({ dataset, onChange }: DatasetPickerProps) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40">Dataset:</span>
            <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1">
                {DATASETS.map(({ value, label, hint }) => {
                    const active = dataset === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            title={hint}
                            onClick={() => onChange(value)}
                            className={cn(
                                'px-3 py-1 rounded-md text-[12px] font-bold transition-all duration-150',
                                active
                                    ? 'bg-primary/20 text-primary shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                            )}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
