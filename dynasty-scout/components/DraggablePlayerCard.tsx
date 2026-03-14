import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Player } from '@/lib/types';
import { GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
        opacity: isDragging ? 0.5 : 1,
    };

    const positionColor = POSITION_COLORS[player.position] || 'bg-gray-100/10 text-gray-500';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative flex items-center gap-3 p-2 bg-card rounded-md border border-border/40 shadow-sm hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing",
                isDragging && "border-primary shadow-lg ring-2 ring-primary/20 bg-accent"
            )}
            {...attributes}
            {...listeners}
        >
            {/* Drag Handle */}
            <div className="text-muted-foreground/30 group-hover:text-muted-foreground/80 transition-colors">
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Rank (if provided) */}
            {rank && (
                <span className="text-xs font-mono font-bold text-muted-foreground w-6 text-center">
                    {rank}
                </span>
            )}

            {/* Content */}
            <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{player.full_name}</span>
                    <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-4 border-0", positionColor)}>
                        {player.position}
                    </Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{player.nfl_team || "FA"}</span>
                    <span>•</span>
                    <span>{player.age_at_draft || "?"} yrs</span>
                </div>
            </div>

            {/* Quick remove/action could go here */}
        </div>
    );
}
