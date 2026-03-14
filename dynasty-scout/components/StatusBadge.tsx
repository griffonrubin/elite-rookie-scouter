import { cn } from '@/lib/utils';
import { FileText, Activity, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type PlayerStatus = 'Healthy' | 'Questionable' | 'Doubtful' | 'Out' | 'IR' | 'Suspended';

interface StatusBadgeProps {
    status?: PlayerStatus;
    hasNews?: boolean;
    className?: string;
}

const STATUS_CONFIG: Record<string, { label: string, color: string, icon: any }> = {
    'Healthy': { label: 'Active', color: 'bg-transparent', icon: null },
    'Questionable': { label: 'Q', color: 'bg-yellow-500 text-white', icon: AlertCircle },
    'Doubtful': { label: 'D', color: 'bg-orange-500 text-white', icon: AlertCircle },
    'Out': { label: 'O', color: 'bg-red-600 text-white', icon: Activity },
    'IR': { label: 'IR', color: 'bg-red-800 text-white', icon: Activity },
    'Suspended': { label: 'SUS', color: 'bg-gray-800 text-white', icon: FileText },
};

export function StatusBadge({ status, hasNews, className }: StatusBadgeProps) {
    const config = status ? STATUS_CONFIG[status] : null;

    return (
        <div className={cn("flex items-center gap-1", className)}>
            {/* News Indicator - Sleeper style orange/grey file icon */}
            {hasNews && (
                <Tooltip>
                    <TooltipTrigger>
                        <div className="relative group cursor-pointer">
                            <FileText className="w-4 h-4 text-orange-400 fill-orange-400/20" />
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-orange-500 rounded-full border border-background" />
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        Recent News Available
                    </TooltipContent>
                </Tooltip>
            )}

            {/* Injury/Availability Status */}
            {config && status !== 'Healthy' && (
                <Tooltip>
                    <TooltipTrigger>
                        <div className={cn(
                            "flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shadow-sm",
                            config.color
                        )}>
                            {config.label}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        Status: {status}
                    </TooltipContent>
                </Tooltip>
            )}
        </div>
    );
}
