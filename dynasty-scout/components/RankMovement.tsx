import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RankMovementProps {
    change?: number; // positive = moved up (rank decreased), negative = moved down (rank increased)
    period: '1d' | '7d' | '30d';
    className?: string;
}

export function RankMovement({ change, period, className }: RankMovementProps) {
    // Logic: 
    // If rank goes from 5 to 2, change is +3 (Improvement)
    // If rank goes from 2 to 5, change is -3 (Decline)

    if (change === undefined || change === 0) {
        return (
            <Tooltip>
                <TooltipTrigger>
                    <div className={cn("flex items-center text-gray-400 gap-0.5", className)}>
                        <Minus className="w-3 h-3" />
                    </div>
                </TooltipTrigger>
                <TooltipContent>No change in last {period}</TooltipContent>
            </Tooltip>
        );
    }

    const isPositive = change > 0;
    const absChange = Math.abs(change);

    return (
        <Tooltip>
            <TooltipTrigger>
                <div className={cn(
                    "flex items-center gap-0.5 text-xs font-medium",
                    isPositive ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500",
                    className
                )}>
                    {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    <span>{absChange}</span>
                </div>
            </TooltipTrigger>
            <TooltipContent>
                Moved {isPositive ? "up" : "down"} {absChange} spots in last {period}
            </TooltipContent>
        </Tooltip>
    );
}
