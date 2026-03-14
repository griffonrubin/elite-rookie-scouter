import { Badge } from "@/components/ui/badge";
import { ExternalLink, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsItem {
    id: number;
    title: string;
    summary: string;
    source: string;
    source_url: string;
    published_at: string;
}

interface NewsFeedProps {
    news: NewsItem[];
}

// Extract a readable outlet name from URL or raw source string
function extractSourceLabel(source: string, url: string): string {
    // If source is already a readable name (no slashes, no dots starting it), use it
    if (source && !source.startsWith('http') && !source.includes('/') && source.length < 60) {
        return source;
    }
    // Try to extract domain from URL
    try {
        const hostname = new URL(url || source).hostname.replace('www.', '');
        // Map known domains to friendly names
        const domainMap: Record<string, string> = {
            'establishtherun.com': 'Establish The Run',
            'fantasypros.com': 'FantasyPros',
            'dynastynerds.com': 'Dynasty Nerds',
            'rotoballer.com': 'RotoBaller',
            'nfl.com': 'NFL.com',
            'espn.com': 'ESPN',
            'cbssports.com': 'CBS Sports',
            'si.com': 'Sports Illustrated',
            'theringer.com': 'The Ringer',
            'rotoworld.com': 'Rotoworld',
            'footballguys.com': 'Football Guys',
            'pff.com': 'PFF',
            'profootballfocus.com': 'PFF',
            'fantasyfootballcalculator.com': 'FF Calculator',
            'dynastyleaguefootball.com': 'DLF',
            'keeptradecut.com': 'KeepTradeCut',
            'sleeper.app': 'Sleeper',
            'fourfourtwobeat.com': '442 Beat',
            'nbcsports.com': 'NBC Sports',
            'foxsports.com': 'Fox Sports',
        };
        if (domainMap[hostname]) return domainMap[hostname];
        // Capitalize first segment of domain
        return hostname.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    } catch {
        return source || 'News';
    }
}

function getSourceColor(label: string): string {
    if (label.includes('FantasyPros')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (label.includes('Dynasty Nerds')) return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
    if (label.includes('Establish')) return 'bg-[#FF6B00]/20 text-[#FF9A50] border-[#FF6B00]/30';
    if (label.includes('PFF')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (label.includes('ESPN')) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (label.includes('NFL')) return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    return 'bg-muted/60 text-muted-foreground border-border/40';
}

export function NewsFeed({ news }: NewsFeedProps) {
    if (news.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground border border-dashed border-border/40 rounded-xl">
                <Newspaper className="w-8 h-8 opacity-30" />
                <p className="text-sm">No recent news found for this player.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {news.map((item) => {
                const sourceLabel = extractSourceLabel(item.source, item.source_url);
                const sourceColor = getSourceColor(sourceLabel);
                const timeAgo = (() => {
                    try { return formatDistanceToNow(new Date(item.published_at), { addSuffix: true }); }
                    catch { return ''; }
                })();

                return (
                    <a
                        key={item.id}
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col gap-2 bg-card border border-border/50 rounded-xl p-4 hover:border-primary/40 hover:bg-accent/30 transition-all duration-150"
                    >
                        {/* Source + time row */}
                        <div className="flex items-center gap-2">
                            <span
                                style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}
                                className={`border ${sourceColor}`}
                            >
                                {sourceLabel}
                            </span>
                            {timeAgo && (
                                <span className="text-[10px] text-muted-foreground/60">{timeAgo}</span>
                            )}
                            <ExternalLink className="w-3 h-3 text-muted-foreground/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        {/* Title */}
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                            {item.title}
                        </div>

                        {/* Summary */}
                        {item.summary && (
                            <p className="text-[12px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
                                {item.summary.replace(/<[^>]*>?/gm, '')}
                            </p>
                        )}
                    </a>
                );
            })}
        </div>
    );
}
