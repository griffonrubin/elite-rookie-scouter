"""
sync_to_supabase.py
Syncs local SQLite data to Supabase PostgreSQL.

Run from dynasty-scout/ directory:
  py -3 scrapers/sync_to_supabase.py

Handles:
  1. Schema migration (new columns)
  2. measurables (forty_yard, vertical, broad, hand_size, arm_length, etc.)
  3. college_stats (epa_per_play, sp_rating)
  4. players (recruiting_composite, recruiting_stars, recruiting_year, headshot_url)
  5. historical_comps table (create + populate)
  6. consensus_rankings
"""

import os
import sqlite3
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
load_dotenv(dotenv_path=".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in .env.local")

SQLITE_PATH = "dynasty_scout.db"


def pg_conn():
    return psycopg2.connect(DATABASE_URL, sslmode="require")


def sqlite_conn():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── Schema migration ──────────────────────────────────────────────────────

def ensure_pg_schema(pg):
    cur = pg.cursor()

    migrations = [
        # measurables
        "ALTER TABLE measurables ADD COLUMN IF NOT EXISTS hand_size REAL",
        "ALTER TABLE measurables ADD COLUMN IF NOT EXISTS arm_length REAL",
        "ALTER TABLE measurables ADD COLUMN IF NOT EXISTS wingspan REAL",
        # college_stats
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS epa_per_play REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS sp_rating REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS dominator_rating REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS market_share REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS air_yards REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS adot REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS ppa_avg REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS ppa_total REAL",
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS usage_pct REAL",
        # players
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS recruiting_composite REAL",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS recruiting_stars INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS recruiting_year INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS breakout_age REAL",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS breakout_year INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS espn_college_id BIGINT",
        # wr_advanced_career table
        """
        CREATE TABLE IF NOT EXISTS wr_advanced_career (
            id SERIAL PRIMARY KEY,
            player_id INTEGER UNIQUE REFERENCES players(id),
            qbr_when_targeted REAL, adot REAL, yprr REAL,
            zone_yprr REAL, man_yprr REAL,
            first_down_rate REAL, td_per_route REAL,
            first_down_per_target REAL, td_per_target REAL,
            yac_per_rec REAL, air_yards_per_rec REAL,
            catch_rate REAL, target_rate REAL, open_target_rate REAL,
            drop_rate REAL, contested_catch_rate REAL, forced_mtf_pct REAL,
            yac_rate REAL, air_yards_rate REAL,
            wide_rate REAL, slot_rate REAL,
            data_source TEXT DEFAULT 'manual_2026',
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        # historical_comps table
        """
        CREATE TABLE IF NOT EXISTS historical_comps (
            id              SERIAL PRIMARY KEY,
            player_id       INTEGER NOT NULL REFERENCES players(id),
            comp_name       TEXT,
            comp_year       INTEGER,
            comp_round      INTEGER,
            comp_pick       INTEGER,
            comp_team       TEXT,
            comp_position   TEXT,
            comp_car_av     INTEGER,
            comp_w_av       INTEGER,
            comp_probowls   INTEGER,
            similarity      REAL,
            shared_metrics  TEXT,
            created_at      TIMESTAMP DEFAULT NOW()
        )
        """,
    ]

    for sql in migrations:
        try:
            cur.execute(sql)
        except Exception as e:
            pg.rollback()
            print(f"  Migration warning: {e}")
            cur = pg.cursor()
        else:
            pg.commit()

    cur.close()
    print("Schema migrations done.")


# ── Sync measurables ──────────────────────────────────────────────────────

def sync_measurables(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT m.player_id, m.forty_yard, m.ten_yard_split, m.bench_press,
               m.vertical_jump, m.broad_jump, m.three_cone, m.twenty_yard_shuttle,
               m.speed_score, m.ras, m.hand_size, m.arm_length, m.wingspan,
               p.headshot_url
        FROM measurables m
        JOIN players p ON p.id = m.player_id
        WHERE p.draft_year = 2026
    """).fetchall()

    upserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO measurables (player_id, forty_yard, ten_yard_split, bench_press,
                vertical_jump, broad_jump, three_cone, twenty_yard_shuttle,
                speed_score, ras, hand_size, arm_length, wingspan)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id) DO UPDATE SET
                forty_yard           = COALESCE(EXCLUDED.forty_yard, measurables.forty_yard),
                ten_yard_split       = COALESCE(EXCLUDED.ten_yard_split, measurables.ten_yard_split),
                bench_press          = COALESCE(EXCLUDED.bench_press, measurables.bench_press),
                vertical_jump        = COALESCE(EXCLUDED.vertical_jump, measurables.vertical_jump),
                broad_jump           = COALESCE(EXCLUDED.broad_jump, measurables.broad_jump),
                three_cone           = COALESCE(EXCLUDED.three_cone, measurables.three_cone),
                twenty_yard_shuttle  = COALESCE(EXCLUDED.twenty_yard_shuttle, measurables.twenty_yard_shuttle),
                speed_score          = COALESCE(EXCLUDED.speed_score, measurables.speed_score),
                ras                  = COALESCE(EXCLUDED.ras, measurables.ras),
                hand_size            = COALESCE(EXCLUDED.hand_size, measurables.hand_size),
                arm_length           = COALESCE(EXCLUDED.arm_length, measurables.arm_length),
                wingspan             = COALESCE(EXCLUDED.wingspan, measurables.wingspan)
        """, (r["player_id"], r["forty_yard"], r["ten_yard_split"], r["bench_press"],
              r["vertical_jump"], r["broad_jump"], r["three_cone"], r["twenty_yard_shuttle"],
              r["speed_score"], r["ras"], r["hand_size"], r["arm_length"], r["wingspan"]))
        upserted += 1

        # Also sync headshot_url to players table
        if r["headshot_url"]:
            cur_pg.execute("""
                UPDATE players SET headshot_url = %s
                WHERE id = %s AND headshot_url IS NULL
            """, (r["headshot_url"], r["player_id"]))

    pg.commit()
    print(f"Measurables: {upserted} rows upserted")


# ── Sync college_stats EPA + SP+ ──────────────────────────────────────────

def sync_college_stats_analytics(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT cs.player_id, cs.season, cs.epa_per_play, cs.sp_rating
        FROM college_stats cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.draft_year = 2026
          AND (cs.epa_per_play IS NOT NULL OR cs.sp_rating IS NOT NULL)
    """).fetchall()

    updated = 0
    for r in rows:
        cur_pg.execute("""
            UPDATE college_stats
            SET epa_per_play = COALESCE(epa_per_play, %s),
                sp_rating    = COALESCE(sp_rating, %s)
            WHERE player_id = %s AND season = %s
        """, (r["epa_per_play"], r["sp_rating"], r["player_id"], r["season"]))
        updated += cur_pg.rowcount

    pg.commit()
    print(f"College stats analytics: {updated} rows updated")


# ── Sync advanced metrics (dominator, market share) ───────────────────────

def sync_advanced_metrics(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT cs.player_id, cs.season, cs.dominator_rating, cs.market_share
        FROM college_stats cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.draft_year = 2026
          AND (cs.dominator_rating IS NOT NULL OR cs.market_share IS NOT NULL)
    """).fetchall()

    updated = 0
    for r in rows:
        cur_pg.execute("""
            UPDATE college_stats
            SET dominator_rating = COALESCE(dominator_rating, %s),
                market_share     = COALESCE(market_share, %s)
            WHERE player_id = %s AND season = %s
        """, (r["dominator_rating"], r["market_share"], r["player_id"], r["season"]))
        updated += cur_pg.rowcount

    pg.commit()
    print(f"Advanced metrics (dominator/market share): {updated} rows updated")


def sync_breakout_age(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT id, breakout_age, breakout_year
        FROM players
        WHERE draft_year = 2026
          AND breakout_age IS NOT NULL
    """).fetchall()

    updated = 0
    for r in rows:
        cur_pg.execute("""
            UPDATE players SET
                breakout_age  = COALESCE(breakout_age, %s),
                breakout_year = COALESCE(breakout_year, %s)
            WHERE id = %s
        """, (r["breakout_age"], r["breakout_year"], r["id"]))
        updated += cur_pg.rowcount

    pg.commit()
    print(f"Breakout age: {updated} players updated")


# ── Sync player recruiting fields ─────────────────────────────────────────

def sync_player_recruiting(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT id, recruiting_composite, recruiting_stars, recruiting_year, headshot_url,
               espn_college_id
        FROM players
        WHERE draft_year = 2026
          AND (recruiting_composite IS NOT NULL OR headshot_url IS NOT NULL
               OR espn_college_id IS NOT NULL)
    """).fetchall()

    updated = 0
    for r in rows:
        cur_pg.execute("""
            UPDATE players SET
                recruiting_composite = COALESCE(recruiting_composite, %s),
                recruiting_stars     = COALESCE(recruiting_stars, %s),
                recruiting_year      = COALESCE(recruiting_year, %s),
                headshot_url         = COALESCE(headshot_url, %s),
                espn_college_id      = COALESCE(espn_college_id, %s)
            WHERE id = %s
        """, (r["recruiting_composite"], r["recruiting_stars"],
              r["recruiting_year"], r["headshot_url"],
              r["espn_college_id"], r["id"]))
        updated += cur_pg.rowcount

    pg.commit()
    print(f"Player recruiting/headshots: {updated} rows updated")


# ── Sync historical_comps ─────────────────────────────────────────────────

def sync_historical_comps(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    # Clear and repopulate (small table, safe to replace)
    cur_pg.execute("DELETE FROM historical_comps WHERE player_id IN "
                   "(SELECT id FROM players WHERE draft_year = 2026)")

    rows = cur_sq.execute("""
        SELECT hc.*
        FROM historical_comps hc
        JOIN players p ON p.id = hc.player_id
        WHERE p.draft_year = 2026
    """).fetchall()

    inserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO historical_comps
              (player_id, comp_name, comp_year, comp_round, comp_pick,
               comp_team, comp_position, comp_car_av, comp_w_av, comp_probowls,
               similarity, shared_metrics)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (r["player_id"], r["comp_name"], r["comp_year"], r["comp_round"],
              r["comp_pick"], r["comp_team"], r["comp_position"],
              r["comp_car_av"], r["comp_w_av"], r["comp_probowls"],
              r["similarity"], r["shared_metrics"]))
        inserted += 1

    pg.commit()
    print(f"Historical comps: {inserted} rows inserted")


# ── Sync individual rankings (source rankings) ────────────────────────────

def sync_individual_rankings(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    # Ensure rankings table exists in Supabase
    cur_pg.execute("""
        CREATE TABLE IF NOT EXISTS rankings (
            id              SERIAL PRIMARY KEY,
            player_id       INTEGER NOT NULL REFERENCES players(id),
            source          TEXT NOT NULL,
            rank_overall    INTEGER,
            rank_positional INTEGER,
            tier            INTEGER,
            source_url      TEXT,
            scraped_at      TEXT,
            UNIQUE(player_id, source, scraped_at)
        )
    """)
    pg.commit()

    rows = cur_sq.execute("""
        SELECT r.player_id, r.source, r.rank_overall, r.rank_positional,
               r.tier, r.source_url, r.scraped_at
        FROM rankings r
        JOIN players p ON p.id = r.player_id
        WHERE p.draft_year = 2026
    """).fetchall()

    upserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO rankings (player_id, source, rank_overall, rank_positional, tier, source_url, scraped_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id, source, scraped_at) DO UPDATE SET
                rank_overall    = EXCLUDED.rank_overall,
                rank_positional = EXCLUDED.rank_positional,
                source_url      = EXCLUDED.source_url
        """, (r["player_id"], r["source"], r["rank_overall"], r["rank_positional"],
              r["tier"], r["source_url"], r["scraped_at"]))
        upserted += 1

    pg.commit()
    print(f"Individual rankings: {upserted} rows upserted")


# ── Sync consensus rankings ───────────────────────────────────────────────

def sync_consensus_rankings(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT cr.*
        FROM consensus_rankings cr
        JOIN players p ON p.id = cr.player_id
        WHERE p.draft_year = 2026
    """).fetchall()

    upserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO consensus_rankings
              (player_id, rank_overall, rank_positional, avg_rank, best_rank,
               worst_rank, std_deviation, num_sources, calculated_at,
               rank_change_1d, rank_change_7d, rank_change_30d)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id, calculated_at) DO UPDATE SET
                rank_overall    = EXCLUDED.rank_overall,
                rank_positional = EXCLUDED.rank_positional,
                avg_rank        = EXCLUDED.avg_rank,
                num_sources     = EXCLUDED.num_sources,
                rank_change_1d  = EXCLUDED.rank_change_1d,
                rank_change_7d  = EXCLUDED.rank_change_7d,
                rank_change_30d = EXCLUDED.rank_change_30d
        """, (r["player_id"], r["rank_overall"], r["rank_positional"],
              r["avg_rank"], r["best_rank"], r["worst_rank"],
              r["std_deviation"], r["num_sources"], r["calculated_at"],
              r["rank_change_1d"], r["rank_change_7d"], r["rank_change_30d"]))
        upserted += 1

    pg.commit()
    print(f"Consensus rankings: {upserted} rows upserted")


# ── Sync WR advanced career ───────────────────────────────────────────────

def sync_wr_advanced_career(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT * FROM wr_advanced_career
    """).fetchall()

    cols = [d[0] for d in cur_sq.description if d[0] not in ('id', 'updated_at')]
    upserted = 0
    for r in rows:
        vals = [r[c] for c in cols]
        set_clause = ", ".join(
            f"{c} = COALESCE(EXCLUDED.{c}, wr_advanced_career.{c})"
            for c in cols if c != 'player_id'
        )
        cur_pg.execute(f"""
            INSERT INTO wr_advanced_career ({', '.join(cols)})
            VALUES ({', '.join('%s' for _ in cols)})
            ON CONFLICT (player_id) DO UPDATE SET {set_clause},
                updated_at = NOW()
        """, vals)
        upserted += 1

    pg.commit()
    print(f"WR advanced career: {upserted} rows upserted")


# ── Main ──────────────────────────────────────────────────────────────────

def run():
    print(f"Connecting to Supabase...")
    pg = pg_conn()
    sq = sqlite_conn()

    print("\n[1/6] Migrating schema...")
    ensure_pg_schema(pg)

    print("\n[2/6] Syncing measurables...")
    sync_measurables(pg, sq)

    print("\n[3/6] Syncing college stats (EPA/SP+)...")
    sync_college_stats_analytics(pg, sq)

    print("\n[3b] Syncing advanced metrics (dominator/market share)...")
    sync_advanced_metrics(pg, sq)

    print("\n[3c] Syncing breakout age...")
    sync_breakout_age(pg, sq)

    print("\n[4/6] Syncing player recruiting + headshots...")
    sync_player_recruiting(pg, sq)

    print("\n[5/6] Syncing historical comps...")
    sync_historical_comps(pg, sq)

    print("\n[5b] Syncing individual rankings...")
    sync_individual_rankings(pg, sq)

    print("\n[5c] Syncing WR advanced career stats...")
    sync_wr_advanced_career(pg, sq)

    print("\n[6/6] Syncing consensus rankings...")
    sync_consensus_rankings(pg, sq)

    pg.close()
    sq.close()
    print("\nSync complete.")


if __name__ == "__main__":
    run()
