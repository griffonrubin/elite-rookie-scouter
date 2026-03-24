"""
sync_to_supabase.py
Syncs local SQLite data to Supabase PostgreSQL.

Run from dynasty-scout/ directory:
  py -3 scrapers/sync_to_supabase.py

Handles:
  1. Schema migration (new columns)
  2. measurables (forty_yard, vertical, broad, hand_size, arm_length, etc.)
  3. college_stats (epa_per_play, sp_rating + phantom row cleanup + full upsert)
  4. players (recruiting_composite, recruiting_stars, recruiting_year, headshot_url)
  5. historical_comps table (create + populate)
  6. consensus_rankings
  7. high_school_stats (create + populate)
  8. college_career cleanup (orphaned rows)
  9. players.hometown
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
        # players.hometown
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS hometown TEXT",
        # high_school_stats table
        """
        CREATE TABLE IF NOT EXISTS high_school_stats (
            id SERIAL PRIMARY KEY,
            player_id INTEGER REFERENCES players(id) UNIQUE,
            high_school TEXT,
            city TEXT,
            state TEXT,
            graduating_class INTEGER,
            games INTEGER,
            pass_yards INTEGER,
            pass_tds INTEGER,
            rush_yards INTEGER,
            rush_tds INTEGER,
            rec_yards INTEGER,
            rec_tds INTEGER,
            total_yards INTEGER,
            total_tds INTEGER,
            data_source TEXT,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        # high_school_stats new columns
        "ALTER TABLE high_school_stats ADD COLUMN IF NOT EXISTS receptions INTEGER",
        "ALTER TABLE high_school_stats ADD COLUMN IF NOT EXISTS interceptions INTEGER",
        "ALTER TABLE high_school_stats ADD COLUMN IF NOT EXISTS fumbles INTEGER",
        # college_stats fumbles
        "ALTER TABLE college_stats ADD COLUMN IF NOT EXISTS fumbles INTEGER",
        # jfoster_grades table
        """
        CREATE TABLE IF NOT EXISTS jfoster_grades (
            id SERIAL PRIMARY KEY,
            player_id INTEGER REFERENCES players(id) UNIQUE,
            overall_grade REAL,
            round_grade TEXT,
            nfl_comp TEXT,
            summary TEXT,
            strengths TEXT,
            weaknesses TEXT,
            film_grades TEXT,
            size_score REAL,
            speed_score_jf REAL,
            acceleration_score REAL,
            agility_score_jf REAL,
            athletic_score REAL,
            source TEXT DEFAULT 'jfoster_2026',
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        # measurables new combine columns
        "ALTER TABLE measurables ADD COLUMN IF NOT EXISTS athleticism_score REAL",
        "ALTER TABLE measurables ADD COLUMN IF NOT EXISTS draft_grade_nfl REAL",
        "ALTER TABLE measurables ADD COLUMN IF NOT EXISTS nfl_comparison TEXT",
        # nfl_scout_profiles table
        """
        CREATE TABLE IF NOT EXISTS nfl_scout_profiles (
            id SERIAL PRIMARY KEY,
            player_id INTEGER REFERENCES players(id) UNIQUE,
            overview TEXT,
            strengths TEXT,
            weaknesses TEXT,
            profile_author TEXT,
            athleticism_score REAL,
            production_score REAL,
            size_score REAL,
            draft_grade REAL,
            nfl_comparison TEXT,
            source TEXT DEFAULT 'nfl_combine_2026',
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
               m.athleticism_score, m.draft_grade_nfl, m.nfl_comparison,
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
                speed_score, ras, hand_size, arm_length, wingspan,
                athleticism_score, draft_grade_nfl, nfl_comparison)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
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
                wingspan             = COALESCE(EXCLUDED.wingspan, measurables.wingspan),
                athleticism_score    = COALESCE(EXCLUDED.athleticism_score, measurables.athleticism_score),
                draft_grade_nfl      = COALESCE(EXCLUDED.draft_grade_nfl, measurables.draft_grade_nfl),
                nfl_comparison       = COALESCE(EXCLUDED.nfl_comparison, measurables.nfl_comparison)
        """, (r["player_id"], r["forty_yard"], r["ten_yard_split"], r["bench_press"],
              r["vertical_jump"], r["broad_jump"], r["three_cone"], r["twenty_yard_shuttle"],
              r["speed_score"], r["ras"], r["hand_size"], r["arm_length"], r["wingspan"],
              r["athleticism_score"], r["draft_grade_nfl"], r["nfl_comparison"]))
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


# ── Sync high_school_stats ────────────────────────────────────────────────

def sync_high_school_stats(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT hs.player_id, hs.high_school, hs.city, hs.state,
               hs.graduating_class, hs.games,
               hs.pass_yards, hs.pass_tds,
               hs.rush_yards, hs.rush_tds,
               hs.rec_yards, hs.rec_tds,
               hs.receptions, hs.interceptions, hs.fumbles,
               hs.total_yards, hs.total_tds,
               hs.data_source
        FROM high_school_stats hs
        JOIN players p ON p.id = hs.player_id
        WHERE p.draft_year = 2026
    """).fetchall()

    upserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO high_school_stats (player_id, high_school, city, state,
                graduating_class, games, pass_yards, pass_tds,
                rush_yards, rush_tds, rec_yards, rec_tds,
                receptions, interceptions, fumbles,
                total_yards, total_tds, data_source)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id) DO UPDATE SET
                high_school = EXCLUDED.high_school,
                city = EXCLUDED.city,
                state = EXCLUDED.state,
                graduating_class = EXCLUDED.graduating_class,
                games = EXCLUDED.games,
                pass_yards = EXCLUDED.pass_yards,
                pass_tds = EXCLUDED.pass_tds,
                rush_yards = EXCLUDED.rush_yards,
                rush_tds = EXCLUDED.rush_tds,
                rec_yards = EXCLUDED.rec_yards,
                rec_tds = EXCLUDED.rec_tds,
                receptions = EXCLUDED.receptions,
                interceptions = EXCLUDED.interceptions,
                fumbles = EXCLUDED.fumbles,
                total_yards = EXCLUDED.total_yards,
                total_tds = EXCLUDED.total_tds,
                data_source = EXCLUDED.data_source,
                updated_at = NOW()
        """, (r["player_id"], r["high_school"], r["city"], r["state"],
              r["graduating_class"], r["games"],
              r["pass_yards"], r["pass_tds"],
              r["rush_yards"], r["rush_tds"],
              r["rec_yards"], r["rec_tds"],
              r["receptions"], r["interceptions"], r["fumbles"],
              r["total_yards"], r["total_tds"],
              r["data_source"]))
        upserted += 1

    pg.commit()
    print(f"High school stats: {upserted} rows upserted")


# ── Sync college_stats full (cleanup phantoms + upsert all) ──────────────

def sync_college_stats_full(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    # Get all (player_id, season, school) from SQLite
    lite_rows = cur_sq.execute("SELECT player_id, season, school FROM college_stats").fetchall()
    lite_keys = set((r['player_id'], r['season'], r['school']) for r in lite_rows)

    # Get all (player_id, season, school) from PG
    cur_pg.execute("SELECT player_id, season, school FROM college_stats")
    pg_keys = set((r[0], r[1], r[2]) for r in cur_pg.fetchall())

    # Delete phantom rows in PG that don't exist in SQLite
    to_delete = pg_keys - lite_keys
    deleted = 0
    for pid, season, school in to_delete:
        cur_pg.execute(
            "DELETE FROM college_stats WHERE player_id = %s AND season = %s AND school = %s",
            (pid, season, school)
        )
        deleted += cur_pg.rowcount

    if deleted:
        print(f"  Deleted {deleted} phantom college_stats rows from Supabase")

    # Upsert all SQLite rows
    full_rows = cur_sq.execute("""
        SELECT player_id, season, school, games_played,
               pass_attempts, completions, pass_yards, pass_tds, interceptions,
               rush_attempts, rush_yards, rush_tds, yards_per_carry,
               receptions, rec_yards, rec_tds, targets,
               epa_per_play, sp_rating, dominator_rating, market_share,
               fumbles
        FROM college_stats
    """).fetchall()

    upserted = 0
    for r in full_rows:
        cur_pg.execute("""
            INSERT INTO college_stats (player_id, season, school, games_played,
                pass_attempts, completions, pass_yards, pass_tds, interceptions,
                rush_attempts, rush_yards, rush_tds, yards_per_carry,
                receptions, rec_yards, rec_tds, targets,
                epa_per_play, sp_rating, dominator_rating, market_share,
                fumbles)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id, season, school) DO UPDATE SET
                games_played = EXCLUDED.games_played,
                pass_attempts = EXCLUDED.pass_attempts,
                completions = EXCLUDED.completions,
                pass_yards = EXCLUDED.pass_yards,
                pass_tds = EXCLUDED.pass_tds,
                interceptions = EXCLUDED.interceptions,
                rush_attempts = EXCLUDED.rush_attempts,
                rush_yards = EXCLUDED.rush_yards,
                rush_tds = EXCLUDED.rush_tds,
                yards_per_carry = EXCLUDED.yards_per_carry,
                receptions = EXCLUDED.receptions,
                rec_yards = EXCLUDED.rec_yards,
                rec_tds = EXCLUDED.rec_tds,
                targets = EXCLUDED.targets,
                epa_per_play = EXCLUDED.epa_per_play,
                sp_rating = EXCLUDED.sp_rating,
                dominator_rating = EXCLUDED.dominator_rating,
                market_share = EXCLUDED.market_share,
                fumbles = EXCLUDED.fumbles
        """, (r["player_id"], r["season"], r["school"], r["games_played"],
              r["pass_attempts"], r["completions"], r["pass_yards"], r["pass_tds"], r["interceptions"],
              r["rush_attempts"], r["rush_yards"], r["rush_tds"], r["yards_per_carry"],
              r["receptions"], r["rec_yards"], r["rec_tds"], r["targets"],
              r["epa_per_play"], r["sp_rating"], r["dominator_rating"], r["market_share"],
              r["fumbles"]))
        upserted += 1

    pg.commit()
    print(f"College stats full sync: {upserted} rows upserted, {deleted} phantom rows deleted")


# ── Sync jfoster_grades ───────────────────────────────────────────────────

def sync_jfoster_grades(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT player_id, overall_grade, round_grade, nfl_comp,
               summary, strengths, weaknesses, film_grades,
               size_score, speed_score_jf, acceleration_score,
               agility_score_jf, athletic_score, source
        FROM jfoster_grades
    """).fetchall()

    upserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO jfoster_grades (
                player_id, overall_grade, round_grade, nfl_comp,
                summary, strengths, weaknesses, film_grades,
                size_score, speed_score_jf, acceleration_score,
                agility_score_jf, athletic_score, source
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id) DO UPDATE SET
                overall_grade      = EXCLUDED.overall_grade,
                round_grade        = EXCLUDED.round_grade,
                nfl_comp           = EXCLUDED.nfl_comp,
                summary            = EXCLUDED.summary,
                strengths          = EXCLUDED.strengths,
                weaknesses         = EXCLUDED.weaknesses,
                film_grades        = EXCLUDED.film_grades,
                size_score         = EXCLUDED.size_score,
                speed_score_jf     = EXCLUDED.speed_score_jf,
                acceleration_score = EXCLUDED.acceleration_score,
                agility_score_jf   = EXCLUDED.agility_score_jf,
                athletic_score     = EXCLUDED.athletic_score,
                source             = EXCLUDED.source,
                updated_at         = NOW()
        """, (r["player_id"], r["overall_grade"], r["round_grade"], r["nfl_comp"],
              r["summary"], r["strengths"], r["weaknesses"], r["film_grades"],
              r["size_score"], r["speed_score_jf"], r["acceleration_score"],
              r["agility_score_jf"], r["athletic_score"], r["source"]))
        upserted += 1

    pg.commit()
    print(f"J. Foster grades: {upserted} rows upserted")


# ── Sync nfl_scout_profiles ──────────────────────────────────────────────

def sync_nfl_scout_profiles(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT player_id, overview, strengths, weaknesses, profile_author,
               athleticism_score, production_score, size_score, draft_grade,
               nfl_comparison, source
        FROM nfl_scout_profiles
    """).fetchall()

    upserted = 0
    for r in rows:
        cur_pg.execute("""
            INSERT INTO nfl_scout_profiles (
                player_id, overview, strengths, weaknesses, profile_author,
                athleticism_score, production_score, size_score, draft_grade,
                nfl_comparison, source
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id) DO UPDATE SET
                overview          = EXCLUDED.overview,
                strengths         = EXCLUDED.strengths,
                weaknesses        = EXCLUDED.weaknesses,
                profile_author    = EXCLUDED.profile_author,
                athleticism_score = EXCLUDED.athleticism_score,
                production_score  = EXCLUDED.production_score,
                size_score        = EXCLUDED.size_score,
                draft_grade       = EXCLUDED.draft_grade,
                nfl_comparison    = EXCLUDED.nfl_comparison,
                source            = EXCLUDED.source,
                updated_at        = NOW()
        """, (r["player_id"], r["overview"], r["strengths"], r["weaknesses"],
              r["profile_author"], r["athleticism_score"], r["production_score"],
              r["size_score"], r["draft_grade"], r["nfl_comparison"], r["source"]))
        upserted += 1

    pg.commit()
    print(f"NFL scout profiles: {upserted} rows upserted")


# ── Sync news ─────────────────────────────────────────────────────────────

def sync_news(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    cur_pg.execute("""
        CREATE TABLE IF NOT EXISTS news (
            id SERIAL PRIMARY KEY,
            player_id INTEGER REFERENCES players(id),
            team_id INTEGER,
            title TEXT NOT NULL,
            summary TEXT,
            source TEXT,
            source_url TEXT UNIQUE,
            published_at TEXT,
            scraped_at TIMESTAMP DEFAULT NOW()
        )
    """)
    pg.commit()

    rows = cur_sq.execute("""
        SELECT n.player_id, n.title, n.summary, n.source, n.source_url, n.published_at
        FROM news n
        WHERE n.player_id IS NOT NULL
        ORDER BY n.published_at DESC
    """).fetchall()

    upserted = 0
    for r in rows:
        try:
            cur_pg.execute("""
                INSERT INTO news (player_id, title, summary, source, source_url, published_at)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (source_url) DO UPDATE SET
                    title        = EXCLUDED.title,
                    summary      = EXCLUDED.summary,
                    published_at = EXCLUDED.published_at
            """, (r["player_id"], r["title"], r["summary"],
                  r["source"], r["source_url"], r["published_at"]))
            upserted += 1
        except Exception:
            pg.rollback()
            cur_pg = pg.cursor()

    pg.commit()
    print(f"News: {upserted} articles upserted")


# ── Sync college_career cleanup ──────────────────────────────────────────

def sync_college_career(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    # Get all (player_id, school) from SQLite
    lite_rows = cur_sq.execute("SELECT player_id, school FROM college_career").fetchall()
    lite_keys = set((r['player_id'], r['school']) for r in lite_rows)

    # Get all (player_id, school) from PG
    cur_pg.execute("SELECT player_id, school FROM college_career")
    pg_keys = set((r[0], r[1]) for r in cur_pg.fetchall())

    # Delete orphaned PG rows
    to_delete = pg_keys - lite_keys
    deleted = 0
    for pid, school in to_delete:
        cur_pg.execute("DELETE FROM college_career WHERE player_id = %s AND school = %s", (pid, school))
        deleted += cur_pg.rowcount

    pg.commit()
    if deleted:
        print(f"College career: deleted {deleted} orphaned rows")
    else:
        print(f"College career: no orphaned rows")


# ── Sync players.hometown ────────────────────────────────────────────────

def sync_hometown(pg, sq):
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT id, hometown FROM players
        WHERE draft_year = 2026 AND hometown IS NOT NULL
    """).fetchall()

    updated = 0
    for r in rows:
        cur_pg.execute("""
            UPDATE players SET hometown = %s
            WHERE id = %s AND (hometown IS NULL OR hometown != %s)
        """, (r["hometown"], r["id"], r["hometown"]))
        updated += cur_pg.rowcount

    pg.commit()
    print(f"Player hometown: {updated} rows updated")


# ── Sync headshots (force overwrite) ─────────────────────────────────────

def sync_headshots_force(pg, sq):
    """Sync ALL headshot_url values, overwriting PG even if already set."""
    cur_sq = sq.cursor()
    cur_pg = pg.cursor()

    rows = cur_sq.execute("""
        SELECT id, headshot_url FROM players
        WHERE draft_year = 2026 AND headshot_url IS NOT NULL
    """).fetchall()

    updated = 0
    for r in rows:
        cur_pg.execute("""
            UPDATE players SET headshot_url = %s
            WHERE id = %s AND (headshot_url IS NULL OR headshot_url != %s)
        """, (r["headshot_url"], r["id"], r["headshot_url"]))
        updated += cur_pg.rowcount

    pg.commit()
    print(f"Headshots (force): {updated} rows updated")


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

    print("\n[7] Syncing high school stats...")
    sync_high_school_stats(pg, sq)

    print("\n[8] Syncing college stats (full cleanup + upsert)...")
    sync_college_stats_full(pg, sq)

    print("\n[9] Syncing college career cleanup...")
    sync_college_career(pg, sq)

    print("\n[10] Syncing player hometown...")
    sync_hometown(pg, sq)

    print("\n[11] Syncing headshots (force)...")
    sync_headshots_force(pg, sq)

    print("\n[12] Syncing J. Foster grades...")
    sync_jfoster_grades(pg, sq)

    print("\n[13] Syncing NFL combine scout profiles...")
    sync_nfl_scout_profiles(pg, sq)

    print("\n[14] Syncing news...")
    sync_news(pg, sq)

    pg.close()
    sq.close()
    print("\nSync complete.")


if __name__ == "__main__":
    run()
