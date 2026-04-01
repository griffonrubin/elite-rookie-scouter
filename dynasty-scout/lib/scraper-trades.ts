import sqlite3 from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "dynasty_scout.db");

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "DyCharts/1.0" },
      });

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) return null;
        return null;
      }

      return res.json();
    } catch (err) {
      if (attempt === retries - 1) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

function normalizePlayerName(name: string): string {
  return name.toLowerCase().replace(/['-]/g, "").trim();
}

export async function buildAppPlayerMap(): Promise<Map<string, { id: number; name: string; position: string }>> {
  try {
    const db = sqlite3(dbPath);
    const stmt = db.prepare(
      "SELECT id, full_name, position FROM players WHERE draft_year = 2026"
    );
    const rows = stmt.all();
    db.close();

    const map = new Map();
    for (const row of rows as any[]) {
      map.set(normalizePlayerName(row.full_name), { id: row.id, name: row.full_name, position: row.position });
    }
    return map;
  } catch (err) {
    return new Map();
  }
}

async function fetchSleeperPlayers(): Promise<Map<string, { name: string; position: string }>> {
  try {
    const data = await fetchJson("https://api.sleeper.app/v1/players/nfl");
    if (!data) return new Map();

    const map = new Map();
    for (const [playerId, playerData] of Object.entries(data)) {
      const p = playerData as any;
      if (p.nfl_team) {
        const name = .trim();
        map.set(playerId, { name, position: p.position || "UNK" });
      }
    }
    return map;
  } catch (err) {
    return new Map();
  }
}

export async function runTradesScraper(): Promise<{ status: string; leagues_scraped: number; new_trades: number }> {
  try {
    const db = sqlite3(dbPath);
    const leagues = (db.prepare("SELECT league_id, league_name FROM sleeper_leagues").all() as any[]);
    db.close();

    if (leagues.length === 0) {
      return { status: "no_leagues", leagues_scraped: 0, new_trades: 0 };
    }

    const appPlayerMap = await buildAppPlayerMap();
    const sleeperPlayerMap = await fetchSleeperPlayers();

    if (appPlayerMap.size === 0 || sleeperPlayerMap.size === 0) {
      throw new Error("Failed to load player maps");
    }

    let totalNew = 0;

    for (const league of leagues) {
      try {
        for (let week = 1; week <= 18; week++) {
          const transactions = (await fetchJson(
            
          )) || [];

          const db2 = sqlite3(dbPath);

          for (const tx of transactions as any[]) {
            if (tx.type !== "trade" || tx.status !== "complete") continue;

            const adds = tx.adds || {};
            const drops = tx.drops || {};

            for (const sleeperId of Object.keys(adds)) {
              const sleeperData = sleeperPlayerMap.get(sleeperId);
              if (!sleeperData) continue;

              const normalized = normalizePlayerName(sleeperData.name);
              const appData = appPlayerMap.get(normalized);
              if (!appData) continue;

              const counterparts = Object.keys(drops)
                .map(id => sleeperPlayerMap.get(id)?.name || "Unknown")
                .filter(Boolean);

              const stmt = db2.prepare();
              stmt.run(
                ,
                league.league_id,
                new Date(tx.created_at * 1000).toISOString(),
                appData.id,
                JSON.stringify(counterparts),
                JSON.stringify(adds),
                JSON.stringify(drops)
              );
              totalNew++;
            }

            for (const sleeperId of Object.keys(drops)) {
              const sleeperData = sleeperPlayerMap.get(sleeperId);
              if (!sleeperData) continue;

              const normalized = normalizePlayerName(sleeperData.name);
              const appData = appPlayerMap.get(normalized);
              if (!appData) continue;

              const counterparts = Object.keys(adds)
                .map(id => sleeperPlayerMap.get(id)?.name || "Unknown")
                .filter(Boolean);

              const stmt = db2.prepare();
              stmt.run(
                ,
                league.league_id,
                new Date(tx.created_at * 1000).toISOString(),
                appData.id,
                JSON.stringify(counterparts),
                JSON.stringify(adds),
                JSON.stringify(drops)
              );
              totalNew++;
            }
          }

          db2.close();
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (err) {
        console.error("Failed to scrape league:", err);
      }
    }

    const db3 = sqlite3(dbPath);
    db3.prepare("UPDATE sleeper_leagues SET last_scraped_at = CURRENT_TIMESTAMP").run();
    db3.close();

    return { status: "success", leagues_scraped: leagues.length, new_trades: totalNew };
  } catch (err) {
    console.error("Scraper error:", err);
    throw err;
  }
}