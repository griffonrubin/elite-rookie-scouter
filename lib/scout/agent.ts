import { Prospect, NewsItem, ScoutReport, ScanResult } from '@/types/scout';
import { SEED_PROSPECTS_2026 } from './seed_data';
import { RSSScanner } from '@/lib/data/rss_scanner';
import { SleeperAPI } from '@/lib/data/sleeper';

/**
 * Elite Rookie Scouter Agent - The Brain
 * 
 * This class orchestrates the entire scouting operation:
 * 1. Scans the internet (RSS feeds) for prospect news
 * 2. Analyzes sentiment and updates prospect stock
 * 3. Generates scout reports and rankings
 */
export class ScoutAgent {
    private prospects: Map<string, Prospect>;
    private newsItems: NewsItem[];
    private rssScanner: RSSScanner;
    private sleeperAPI: SleeperAPI;

    constructor() {
        // Initialize with seed data
        this.prospects = new Map(
            SEED_PROSPECTS_2026.map(p => [p.id, { ...p }])
        );
        this.newsItems = [];
        this.rssScanner = new RSSScanner();
        this.sleeperAPI = new SleeperAPI();
    }

    /**
     * Main scanning operation - fetches latest news and updates prospects
     */
    async scanInternet(): Promise<ScanResult> {
        const startTime = Date.now();

        try {
            // Fetch all RSS feed items
            const allNews = await this.rssScanner.scanFeeds();

            // Filter for items mentioning our prospects
            const relevantNews = this.matchNewsToProspects(allNews);

            // Update prospect news counts and stock
            this.updateProspectMetrics(relevantNews);

            // Store news items
            this.newsItems = [...relevantNews, ...this.newsItems].slice(0, 100); // Keep last 100

            return {
                timestamp: new Date().toISOString(),
                itemsFound: allNews.length,
                newProspectMentions: relevantNews.length,
                feeds: this.rssScanner.getFeeds().map(f => ({
                    name: f.name,
                    itemCount: allNews.filter(n => n.source === f.name).length,
                })),
            };
        } catch (error) {
            console.error('Scan failed:', error);
            throw error;
        }
    }

    /**
     * Match news items to prospects based on name mentions
     */
    private matchNewsToProspects(news: NewsItem[]): NewsItem[] {
        const matched: NewsItem[] = [];

        for (const item of news) {
            const searchText = `${item.title}`.toLowerCase();
            const mentionedProspects: string[] = [];

            // Check each prospect
            for (const [id, prospect] of this.prospects) {
                const nameParts = prospect.name.toLowerCase().split(' ');
                const lastName = nameParts[nameParts.length - 1];

                // Match on full name or last name + position
                if (searchText.includes(prospect.name.toLowerCase()) ||
                    (searchText.includes(lastName) && searchText.includes(prospect.position.toLowerCase()))) {
                    mentionedProspects.push(id);
                }
            }

            if (mentionedProspects.length > 0) {
                item.prospectIds = mentionedProspects;
                item.sentiment = this.analyzeSentiment(item.title);
                matched.push(item);
            }
        }

        return matched;
    }

    /**
     * Simple sentiment analysis based on keywords
     */
    private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
        const lower = text.toLowerCase();

        const positiveKeywords = [
            'breakout', 'elite', 'dominant', 'impressive', 'star', 'rising',
            'explosive', 'talented', 'standout', 'phenomenal', 'exceptional'
        ];

        const negativeKeywords = [
            'injury', 'injured', 'concern', 'struggles', 'disappointing',
            'benched', 'suspended', 'drops', 'fumbles', 'questionable'
        ];

        const positiveCount = positiveKeywords.filter(k => lower.includes(k)).length;
        const negativeCount = negativeKeywords.filter(k => lower.includes(k)).length;

        if (positiveCount > negativeCount) return 'positive';
        if (negativeCount > positiveCount) return 'negative';
        return 'neutral';
    }

    /**
     * Update prospect metrics based on recent news
     */
    private updateProspectMetrics(news: NewsItem[]): void {
        const prospectMentions = new Map<string, { positive: number; negative: number }>();

        // Count sentiment mentions
        for (const item of news) {
            for (const prospectId of item.prospectIds) {
                const current = prospectMentions.get(prospectId) || { positive: 0, negative: 0 };
                if (item.sentiment === 'positive') current.positive++;
                if (item.sentiment === 'negative') current.negative++;
                prospectMentions.set(prospectId, current);
            }
        }

        // Update stock based on sentiment
        for (const [prospectId, sentiment] of prospectMentions) {
            const prospect = this.prospects.get(prospectId);
            if (!prospect) continue;

            const netSentiment = sentiment.positive - sentiment.negative;

            if (netSentiment > 2) {
                prospect.stock = 'rising';
                prospect.scoutGrade = Math.min(100, prospect.scoutGrade + 1);
            } else if (netSentiment < -2) {
                prospect.stock = 'falling';
                prospect.scoutGrade = Math.max(0, prospect.scoutGrade - 1);
            } else {
                prospect.stock = 'stable';
            }

            prospect.newsCount = news.filter(n => n.prospectIds.includes(prospectId)).length;
            prospect.lastUpdated = new Date().toISOString();
        }
    }

    /**
     * Generate a detailed scout report for a prospect
     */
    async generateScoutReport(prospectId: string): Promise<ScoutReport | null> {
        const prospect = this.prospects.get(prospectId);
        if (!prospect) return null;

        const prospectNews = this.newsItems
            .filter(n => n.prospectIds.includes(prospectId))
            .slice(0, 10);

        // Generate strengths/concerns based on tier and stock
        const strengths = this.generateStrengths(prospect);
        const concerns = this.generateConcerns(prospect);
        const comparisons = await this.generateComparisons(prospect);

        return {
            prospectId,
            generatedAt: new Date().toISOString(),
            summary: this.generateSummary(prospect),
            strengths,
            concerns,
            comparisons,
            recentNews: prospectNews,
        };
    }

    private generateSummary(prospect: Prospect): string {
        const tierDescriptions = {
            1: 'elite, generational talent',
            2: 'first-round caliber prospect',
            3: 'solid day-two selection',
            4: 'developmental prospect',
            5: 'late-round flier',
        };

        return `${prospect.name} is a ${tierDescriptions[prospect.tier]} from ${prospect.school}. ` +
            `Currently graded at ${prospect.scoutGrade}/100 with ${prospect.stock} stock. ` +
            `Projected ${prospect.projectedRound ? `Round ${prospect.projectedRound}` : 'mid-round'} pick in the 2026 NFL Draft.`;
    }

    private generateStrengths(prospect: Prospect): string[] {
        const positionStrengths: Record<string, string[]> = {
            QB: ['Arm strength', 'Field vision', 'Leadership', 'Mobility'],
            RB: ['Vision', 'Burst', 'Pass-catching ability', 'Contact balance'],
            WR: ['Route running', 'Hands', 'Speed', 'YAC ability'],
            TE: ['Blocking', 'Receiving skills', 'Athleticism', 'Red zone threat'],
        };

        const base = positionStrengths[prospect.position] || [];
        return base.slice(0, prospect.tier <= 2 ? 4 : 3);
    }

    private generateConcerns(prospect: Prospect): string[] {
        if (prospect.tier === 1) {
            return ['Limited college experience', 'Needs to prove consistency'];
        } else if (prospect.tier === 2) {
            return ['Competition level questions', 'Needs refinement'];
        } else {
            return ['Raw prospect', 'Developmental timeline', 'Consistency issues'];
        }
    }

    private async generateComparisons(prospect: Prospect): Promise<string[]> {
        // This would ideally use AI or more sophisticated matching
        // For now, return position-based generic comparisons
        const comparisons: Record<string, string[]> = {
            QB: ['Patrick Mahomes', 'Josh Allen', 'Justin Herbert'],
            RB: ['Bijan Robinson', 'Jahmyr Gibbs', 'Breece Hall'],
            WR: ['Justin Jefferson', 'Ja\'Marr Chase', 'CeeDee Lamb'],
            TE: ['Kyle Pitts', 'Sam LaPorta', 'Dalton Kincaid'],
        };

        return (comparisons[prospect.position] || []).slice(0, 2);
    }

    /**
     * Get all prospects sorted by scout grade
     */
    getRankings(): Prospect[] {
        return Array.from(this.prospects.values())
            .sort((a, b) => b.scoutGrade - a.scoutGrade);
    }

    /**
     * Get prospects by tier
     */
    getProspectsByTier(tier: number): Prospect[] {
        return Array.from(this.prospects.values())
            .filter(p => p.tier === tier)
            .sort((a, b) => b.scoutGrade - a.scoutGrade);
    }

    /**
     * Get a specific prospect
     */
    getProspect(id: string): Prospect | undefined {
        return this.prospects.get(id);
    }

    /**
     * Get recent news
     */
    getRecentNews(limit: number = 20): NewsItem[] {
        return this.newsItems.slice(0, limit);
    }

    /**
     * Get top risers (prospects with rising stock)
     */
    getTopRisers(limit: number = 5): Prospect[] {
        return Array.from(this.prospects.values())
            .filter(p => p.stock === 'rising')
            .sort((a, b) => b.scoutGrade - a.scoutGrade)
            .slice(0, limit);
    }

    /**
     * Get top fallers (prospects with falling stock)
     */
    getTopFallers(limit: number = 5): Prospect[] {
        return Array.from(this.prospects.values())
            .filter(p => p.stock === 'falling')
            .sort((a, b) => a.scoutGrade - b.scoutGrade)
            .slice(0, limit);
    }
}

// Singleton instance
let agentInstance: ScoutAgent | null = null;

export function getScoutAgent(): ScoutAgent {
    if (!agentInstance) {
        agentInstance = new ScoutAgent();
    }
    return agentInstance;
}
