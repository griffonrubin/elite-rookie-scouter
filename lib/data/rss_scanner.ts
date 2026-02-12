import Parser from 'rss-parser';
import { NewsItem, RSSFeed } from '@/types/scout';

// Default RSS feeds for fantasy football news
export const DEFAULT_FEEDS: RSSFeed[] = [
    {
        name: 'FantasyPros',
        url: 'https://www.fantasypros.com/nfl/news/rss/news.xml',
        enabled: true,
    },
    {
        name: 'RotoWire',
        url: 'https://www.rotowire.com/rss/news.php?sport=NFL',
        enabled: true,
    },
    {
        name: 'NFL.com',
        url: 'https://www.nfl.com/feeds/rss/news',
        enabled: true,
    },
];

export class RSSScanner {
    private parser: Parser;
    private feeds: RSSFeed[];

    constructor(feeds: RSSFeed[] = DEFAULT_FEEDS) {
        this.parser = new Parser({
            timeout: 10000,
            headers: {
                'User-Agent': 'Elite-Rookie-Scouter/1.0',
            },
        });
        this.feeds = feeds;
    }

    /**
     * Scan all enabled RSS feeds for new items
     */
    async scanFeeds(): Promise<NewsItem[]> {
        const allNews: NewsItem[] = [];
        const enabledFeeds = this.feeds.filter(f => f.enabled);

        for (const feed of enabledFeeds) {
            try {
                const items = await this.scanFeed(feed);
                allNews.push(...items);
            } catch (error) {
                console.error(`Error scanning feed ${feed.name}:`, error);
            }
        }

        return allNews;
    }

    /**
     * Scan a single RSS feed
     */
    private async scanFeed(feed: RSSFeed): Promise<NewsItem[]> {
        try {
            const parsed = await this.parser.parseURL(feed.url);

            return parsed.items.map((item, index) => ({
                id: `${feed.name.toLowerCase()}-${Date.now()}-${index}`,
                title: item.title || 'Untitled',
                link: item.link || '',
                pubDate: item.pubDate || new Date().toISOString(),
                source: feed.name,
                prospectIds: [], // Will be populated by the Scout Agent
                sentiment: undefined,
            }));
        } catch (error) {
            console.error(`Failed to parse feed ${feed.name}:`, error);
            return [];
        }
    }

    /**
     * Filter news items that mention specific keywords (prospect names)
     */
    filterByKeywords(news: NewsItem[], keywords: string[]): NewsItem[] {
        return news.filter(item => {
            const searchText = `${item.title}`.toLowerCase();
            return keywords.some(keyword =>
                searchText.includes(keyword.toLowerCase())
            );
        });
    }

    /**
     * Get feed status
     */
    getFeeds(): RSSFeed[] {
        return this.feeds;
    }

    /**
     * Update feed configuration
     */
    updateFeed(name: string, updates: Partial<RSSFeed>): void {
        const feed = this.feeds.find(f => f.name === name);
        if (feed) {
            Object.assign(feed, updates);
        }
    }
}
