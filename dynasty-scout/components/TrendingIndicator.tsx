import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TrendingIndicatorProps {
    change?: number; // positive = moved up (improved), negative = moved down (worsened)
    label?: string; // e.g. "3K adds" or "Top 5"
    period?: '1d' | '7d' | '30d';
    className?: string;
    showValue?: boolean;
}

export function TrendingIndicator({ change, label, period, className, showValue = true }: TrendingIndicatorProps) {
    // If no change or 0, showing neutral or nothing
    if (change === undefined || change === 0) {
        return (
            <Tooltip>
                <TooltipTrigger>
                    <div className={cn("flex items-center text-muted-foreground/50", className)}>
                        <Minus className="w-4 h-4" />
                    </div>
                </TooltipTrigger>
                <TooltipContent>No recent change</TooltipContent>
            </Tooltip>
        );
    }

    // In ranking context:
    // If rank goes 10 -> 5 (change is +5 spots better) -> Positive
    // If rank goes 5 -> 10 (change is -5 spots worse) -> Negative
    // Logic depends on data source, but let's assume standard "positive number means improvement" for now
    // Or if passed raw rank diff: (prev - current). 
    // Let's assume the passed 'change' implies magnitude of improvement (positive is good)

    const isPositive = change > 0;
    const absChange = Math.abs(change);

    return (
        <Tooltip>
            <TooltipTrigger>
                <div className={cn(
                    "flex items-center gap-1 font-bold text-xs select-none",
                    isPositive ? "text-emerald-500" : "text-rose-500",
                    className
                )}>
                    {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {showValue && <span>{Math.abs(change)}</span>}
                    {label && <span className="text-[10px] ml-0.5">{label}</span>}
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>Trending {isPositive ? "Up" : "Down"}</p>
                <p className="text-xs text-muted-foreground">{absChange} spots {period ? `in last ${period}` : ''}</p>
            </TooltipContent>
        </Tooltip>
    );
}
