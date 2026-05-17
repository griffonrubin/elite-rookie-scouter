'use client';

import { Gavel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDrafted } from '@/lib/useDrafted';

interface Props {
    playerSlug: string;
    className?: string;
}

/** Per-player toggle that marks a player drafted (off the board). */
export function DraftedButton({ playerSlug, className }: Props) {
    const { drafted, toggle } = useDrafted();
    const isDrafted = drafted.has(playerSlug);
    return (
        <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(playerSlug); }}
            title={isDrafted ? 'Mark as available' : 'Mark as drafted'}
            aria-label={isDrafted ? 'Mark as available' : 'Mark as drafted'}
            className={cn(
                'flex items-center justify-center transition-all',
                isDrafted ? 'opacity-100' : 'opacity-30 hover:opacity-100',
                className,
            )}
        >
            <Gavel className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', isDrafted ? 'text-emerald-400' : 'text-muted-foreground')} />
        </button>
    );
}
