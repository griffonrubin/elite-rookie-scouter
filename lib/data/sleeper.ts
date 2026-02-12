// Sleeper API connector for NFL player data
// API Docs: https://docs.sleeper.app/

export interface SleeperPlayer {
    player_id: string;
    first_name: string;
    last_name: string;
    position: string;
    team: string | null;
    age: number;
    years_exp: number;
}

export class SleeperAPI {
    private baseUrl = 'https://api.sleeper.app/v1';
    private playersCache: Map<string, SleeperPlayer> | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * Fetch all NFL players from Sleeper API
     * Note: This is a large file (~5MB), so we cache it
     */
    async getAllPlayers(): Promise<Map<string, SleeperPlayer>> {
        // Return cached data if still valid
        if (this.playersCache && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
            return this.playersCache;
        }

        try {
            const response = await fetch(`${this.baseUrl}/players/nfl`);
            if (!response.ok) {
                throw new Error(`Sleeper API error: ${response.status}`);
            }

            const data = await response.json();
            this.playersCache = new Map(Object.entries(data));
            this.cacheTimestamp = Date.now();

            return this.playersCache;
        } catch (error) {
            console.error('Failed to fetch Sleeper players:', error);
            return new Map();
        }
    }

    /**
     * Search for players by name
     */
    async searchPlayers(query: string): Promise<SleeperPlayer[]> {
        const players = await this.getAllPlayers();
        const results: SleeperPlayer[] = [];
        const lowerQuery = query.toLowerCase();

        for (const player of players.values()) {
            const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
            if (fullName.includes(lowerQuery)) {
                results.push(player);
            }
        }

        return results;
    }

    /**
     * Get player by ID
     */
    async getPlayer(playerId: string): Promise<SleeperPlayer | null> {
        const players = await this.getAllPlayers();
        return players.get(playerId) || null;
    }

    /**
     * Get players by position
     */
    async getPlayersByPosition(position: string): Promise<SleeperPlayer[]> {
        const players = await this.getAllPlayers();
        const results: SleeperPlayer[] = [];

        for (const player of players.values()) {
            if (player.position === position) {
                results.push(player);
            }
        }

        return results;
    }

    /**
     * Get trending players (useful for identifying hot prospects)
     */
    async getTrendingPlayers(type: 'add' | 'drop' = 'add'): Promise<any[]> {
        try {
            const response = await fetch(`${this.baseUrl}/players/nfl/trending/${type}`);
            if (!response.ok) {
                throw new Error(`Sleeper API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to fetch trending players:', error);
            return [];
        }
    }
}
