"""Shared name normalisation + slug helpers for the redraft pipeline.

Every redraft source (Sleeper, nflverse, FantasyPros, ESPN, ...) spells names a
little differently. These helpers give the scrapers one canonical form to match
on, mirroring the fuzzy approach the existing rookie scrapers use.
"""
import re
import unicodedata

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# Sleeper/nflverse use a few team abbreviations that differ from ours.
TEAM_ALIASES = {
    "JAC": "JAX", "WSH": "WAS", "LA": "LAR", "STL": "LAR",
    "SD": "LAC", "OAK": "LV", "ARZ": "ARI", "BLT": "BAL",
    "CLV": "CLE", "HST": "HOU", "SL": "LAR",
}


def strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )


def normalize_name(name: str) -> str:
    """'A.J. Brown Jr.' -> 'aj brown'  — the canonical cross-source match key."""
    if not name:
        return ""
    n = strip_accents(str(name)).lower()
    n = n.replace("&", " and ")
    n = re.sub(r"[.'`’]", "", n)          # A.J. -> AJ, O'Neal -> ONeal
    n = re.sub(r"[^a-z0-9]+", " ", n)
    parts = [p for p in n.split() if p and p not in SUFFIXES]
    return " ".join(parts)


def slugify(name: str) -> str:
    """'A.J. Brown Jr.' -> 'aj-brown' — matches the existing players.slug style."""
    return normalize_name(name).replace(" ", "-")


def norm_team(team) -> str | None:
    if not team:
        return None
    t = str(team).strip().upper()
    return TEAM_ALIASES.get(t, t)
