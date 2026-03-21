'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Player } from '@/lib/types';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { POSITION_COLORS } from '@/lib/constants';

interface DraggablePlayerCardProps {
    player: Player;
    rank?: number;
}

export function DraggablePlayerCard({ player, rank }: DraggablePlayerCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: player.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.4 : 1,
    };

    const posColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border border-gray-500/40';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group flex items-center gap-2 px-3 py-2 rounded-lg border border-border/30 bg-card/60 cursor-grab active:cursor-grabbing hover:border-border/60 hover:bg-card transition-all",
                isDragging && "border-primary/60 shadow-lg ring-1 ring-primary/20 bg-card"
            )}
            {...attributes}
            {...listeners}
        >
            {/* Position badge */}
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0", posColor)}>
                {player.position}
            </span>

            {/* Name + school */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {rank !== undefined && rank > 0 && (
                        <span className="text-[10px] font-mono font-bold text-muted-foreground/50 w-4 flex-shrink-0">
                            {rank}
                        </span>
                    )}
                    <span className="text-xs font-bold truncate text-foreground">{player.full_name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground/60 truncate pl-0">
                    {player.school || player.nfl_team || 'N/A'}
                </div>
            </div>

            {/* Drag handle */}
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors flex-shrink-0" />
        </div>
    );
}
