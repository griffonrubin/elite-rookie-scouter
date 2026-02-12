// Core domain types for the Elite Rookie Scouter Agent

export interface Prospect {
    id: string;
    name: string;
    position: 'QB' | 'RB' | 'WR' | 'TE';
    school: string;
    year: number; // Draft year (2026)
    projectedRound?: number;

    // Scout metrics
    scoutGrade: number; // 0-100
    stock: 'rising' | 'falling' | 'stable';
    tier: 1 | 2 | 3 | 4 | 5; // Tier 1 = Elite

    // Metadata
    lastUpdated: string; // ISO date
    newsCount: number;
}

export interface NewsItem {
    id: string;
    title: string;
    link: string;
    pubDate: string;
    source: string; // e.g., "FantasyPros", "RotoWire"
    prospectIds: string[]; // Which prospects are mentioned
    sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface ScoutReport {
    prospectId: string;
    generatedAt: string;
    summary: string; // AI-generated summary
    strengths: string[];
    concerns: string[];
    comparisons: string[]; // NFL player comparisons
    recentNews: NewsItem[];
}

export interface DraftClass {
    year: number;
    prospects: Prospect[];
    lastScanned: string;
}

export interface RSSFeed {
    name: string;
    url: string;
    enabled: boolean;
}

export interface ScanResult {
    timestamp: string;
    itemsFound: number;
    newProspectMentions: number;
    feeds: {
        name: string;
        itemCount: number;
        error?: string;
    }[];
}
