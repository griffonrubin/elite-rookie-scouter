import sql from '@/lib/db';
import { RSSScanner, NewsItem } from '@/lib/data/rss_scanner';
import { SleeperAPI } from '@/lib/data/sleeper';

export interface Prospect {
    id: number;
    slug: string;
    full_name: string;
    position: string;
    school?: string;
    scoutGrade: number;
    stock: 'rising' | 'falling' | 'stable';
    tier: number;
    newsCount: number;
}

export interface ScanResult {
    timestamp: string;
    itemsFound: number;
    newProspectMentions: number;
    newsInserted: number;
    feeds: {
        name: string;
        itemCount: number;
        error?: string;
    }[];
}

export class ScoutAgent {
    private rssScanner: RSSScanner;
    private sleeperAPI: SleeperAPI;

    constructor() {
        this.rssScanner = new RSSScanner();
        this.sleeperAPI = new SleeperAPI();
    }

    async scanInternet(): Promise<ScanResult> {
        try {
            const allNews = await this.rssScanner.scanFeeds();
            const players = await this.getPlayers();
            const matchedNews = this.matchNewsToPlayers(allNews, players);
            const newsInserted = await this.saveNewsToDatabase(matchedNews);
            this.updatePlayerStock(matchedNews);

            return {
                timestamp: new Date().toISOString(),
                itemsFound: allNews.length,
                newProspectMentions: matchedNews.length,
                newsInserted,
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

    private async getPlayers(): Promise<Prospect[]> {
        try {
            const rows = await sql.unsafe(`
                SELECT p.id, p.slug, p.full_name, p.position, cc.school
                FROM players p
                LEFT JOIN college_career cc ON p.id = cc.player_id
                WHERE p.draft_year = 2026
            `) as any[];

            return rows.map(row => ({
                id: row.id,
                slug: row.slug,
                full_name: row.full_name,
                position: row.position,
                school: row.school,
                scoutGrade: 85,
                stock: 'stable' as const,
                tier: 1,
                newsCount: 0,
            }));
        } catch (error) {
            console.error('Failed to get players:', error);
            return [];
        }
    }

    private matchNewsToPlayers(news: NewsItem[], players: Prospect[]): (NewsItem & { player_id: number; sentiment: string })[] {
        const matched: (NewsItem & { player_id: number; sentiment: string })[] = [];

        for (const item of news) {
            const searchText = `${item.title}`.toLowerCase();

            for (const player of players) {
                const nameParts = player.full_name.toLowerCase().split(' ');
                const lastName = nameParts[nameParts.length - 1];

                if (searchText.includes(player.full_name.toLowerCase()) ||
                    (searchText.includes(lastName) && searchText.includes(player.position.toLowerCase()))) {
                    matched.push({ ...item, player_id: player.id, sentiment: this.analyzeSentiment(item.title) });
                    break;
                }
            }
        }

        return matched;
    }

    private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
        const lower = text.toLowerCase();
        const positiveKeywords = ['breakout', 'elite', 'dominant', 'impressive', 'star', 'rising', 'explosive', 'talented', 'standout', 'phenomenal', 'exceptional', 'heisman', 'all-american', 'record', 'touchdown', 'yards'];
        const negativeKeywords = ['injury', 'injured', 'concern', 'struggles', 'disappointing', 'benched', 'suspended', 'drops', 'fumbles', 'questionable', 'out', 'miss', 'sidelined', 'limited'];
        const pos = positiveKeywords.filter(k => lower.includes(k)).length;
        const neg = negativeKeywords.filter(k => lower.includes(k)).length;
        if (pos > neg) return 'positive';
        if (neg > pos) return 'negative';
        return 'neutral';
    }

    private async saveNewsToDatabase(news: (NewsItem & { player_id: number; sentiment: string })[]): Promise<number> {
        let inserted = 0;

        for (const item of news) {
            try {
                const result = await sql.unsafe(`
                    INSERT INTO news (player_id, title, summary, source, source_url, published_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (source_url) DO NOTHING
                    RETURNING id
                `, [item.player_id, item.title.substring(0, 255), '', item.source, item.link, item.pubDate]) as any[];

                if (result.length > 0) inserted++;
            } catch (error) {
                console.error('Error inserting news:', error);
            }
        }

        return inserted;
    }

    private updatePlayerStock(news: (NewsItem & { player_id: number; sentiment: string })[]) {
        const playerSentiment = new Map<number, { positive: number; negative: number }>();
        for (const item of news) {
            const current = playerSentiment.get(item.player_id) || { positive: 0, negative: 0 };
            if (item.sentiment === 'positive') current.positive++;
            if (item.sentiment === 'negative') current.negative++;
            playerSentiment.set(item.player_id, current);
        }
        console.log(`Analyzed sentiment for ${playerSentiment.size} players`);
    }

    async getTrendingPlayers() {
        return await this.sleeperAPI.getTrendingPlayers('add');
    }
}

let agentInstance: ScoutAgent | null = null;

export function getScoutAgent(): ScoutAgent {
    if (!agentInstance) {
        agentInstance = new ScoutAgent();
    }
    return agentInstance;
}
