'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RedraftPlayer } from '@/lib/types';
import { BENCH_SLOTS, useLeagueSync } from '@/lib/useLeagueSync';
import { SimPlayer } from '@/lib/startSit';
import { useStartSitData } from '@/lib/useStartSit';
import { simInputFor, simPlayerFrom, type Horizon } from '@/lib/simInput';
import { replacementCost, TradeRosterPlayer } from '@/lib/trade';
import { pairingTable, scheduleUsable } from '@/lib/leagueSchedule';
import { useSeasonOdds } from '@/lib/useSeasonOdds';
import { useClaimWorth } from '@/lib/useClaimWorth';
import { offerKey } from '@/lib/tradeFinder';
import { useLeagueFixtures } from '@/lib/useLeagueFixtures';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { HorizonToggle } from '@/components/redraft/HorizonToggle';
import { TradeFinder } from './TradeFinder';
import { useSchedule } from '@/lib/useSchedule';
import { measureTeam, rankLeague, type TeamProfile } from '@/lib/teamProfile';
import type { Offer } from '@/lib/tradeFinder';
import { RosterPicker } from './RosterPicker';
import { PlayerSearch, type SearchHit } from './PlayerSearch';
import { PickPicker, PickNote } from './PickPicker';
import { MarketValue, type PricedAsset } from './MarketValue';
import {
    findPick, hasPicks, parsePickId, pickInventory, pickName, roundLabel,
    superflexLeague, type PickAsset,
} from '@/lib/tradePicks';
import type { FinderPick } from '@/lib/tradeFinder';
import type { TradePrices } from '@/lib/tradePrices';
import { TradeVerdict } from './TradeVerdict';
import { TradeSummaryBar, useOutOfView } from './TradeSummaryBar';
import { useTradeEvaluation, type TradeInput } from '@/lib/useTradeEvaluation';
import { TradeCompare, type HeldOffer } from './TradeCompare';
import { readTrade, tradeHref } from '@/lib/tradeUrl';

const SEASON = 2026;
const TRIALS = 20000;

/**
 * How many free agents to price at each position.
 *
 * Only the best one sets replacement level, so this is not a pool to search —
 * it is headroom. A couple of the top names can come back without a
 * projection, and the next one down is still a free agent worth the same
 * roster spot.
 */
const WIRE_DEPTH = 6;

/** The lineup shape when the platform does not report one. */
const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
/** Where the regular season ends when the platform will not say. */
const DEFAULT_PLAYOFF_WEEK = 15;

/**
 * A trade, judged on what it does rather than on what it is worth.
 *
 * Pick a partner, pick who goes each way, and the whole league plays its
 * round robin twice: once as things stand and once with both rosters
 * re-filled from their best available players. The answer is the change in
 * how often each side wins — which prices the shape of a lineup, and a value
 * ranking cannot.
 *
 * Both rosters are shown in full and every player is clickable, because the
 * question is never "is this trade good" in the abstract. It is "what else
 * could I have offered instead", and that is a question you answer by trying
 * things.
 */
export function TradeClient({ players, prices }: {
    players: RedraftPlayer[];
    /**
     * The dynasty market, for the half of a trade the season cannot price.
     *
     * Passed from the server component rather than fetched here: it is two
     * numbers per player and twenty-four pick rows, it changes once a day,
     * and a page that already waits on the league's rosters should not also
     * wait on a second round trip for it.
     */
    prices: TradePrices;
}) {
    const league = useLeagueSync(players);
    /** What this league pays per catch; every stored number is full PPR. */
    const scoring = league.snapshot?.scoring ?? null;
    /**
     * A stable key for it, because the scoring arrives with the snapshot and
     * the memos below cache an outcome per player. Depending on the object
     * would re-run them every time the snapshot is rebuilt; depending on
     * nothing would leave every number full PPR for the whole session, since
     * the first render has no league yet.
     */
    const scoringKey = `${scoring?.reception ?? 1}:${scoring?.teReceptionBonus ?? 0}`;
    /**
     * The rest of the season, because that is what a trade is.
     *
     * Nobody trades for one Sunday. Priced on this week the answer moves for
     * reasons a trade cannot: a man on a bye is worth nothing, so acquiring
     * him reads as giving a player away for free, and a soft matchup makes
     * whoever you are receiving look like a steal for seven days. Both were
     * happening, and both invert on the following Tuesday.
     *
     * The week stays available because one case is real — a must-win in the
     * last week before the playoffs, where a bye genuinely is the whole
     * question.
     */
    const [horizon, setHorizon] = useState<Horizon>('season');
    /** Null until the reader picks one; the default below stands in. */
    const [partner, setPartner] = useState<string | null>(null);
    /**
     * Who I am offering, opening on whoever the URL names.
     *
     * Team Analysis knows which of my players the bench already covers —
     * that is the whole point of it — and "covered well enough that losing
     * him would not move the number" is the same sentence as "this is the
     * easiest thing on this roster to trade". Arriving here with him already
     * on the table is the difference between a finding and a move.
     *
     * Read through Next's hook, not off `window`: this page is
     * server-rendered, so a useState initialiser runs where there is no
     * window and hydration keeps the server's empty answer.
     */
    const searchParams = useSearchParams();
    /**
     * Everything the address bar knows about this trade.
     *
     * All three now, not just the players leaving: the page writes the URL
     * back as you build, so the link it produces has to open the same trade
     * it described. `give` alone would reopen your half of it against
     * whoever the page happened to pick.
     */
    const urlTrade = useMemo(() => readTrade(searchParams), [searchParams]);

    const [myGive, setMyGive] = useState<Set<number> | null>(null);
    const [theirGive, setTheirGive] = useState<Set<number> | null>(null);
    /** Picks each way, by the ids `tradePicks` builds. */
    const [myPicks, setMyPicks] = useState<Set<string> | null>(null);
    const [theirPicks, setTheirPicks] = useState<Set<string> | null>(null);

    const fromUrlGive = useMemo(() => new Set(urlTrade.give), [urlTrade.give]);
    const fromUrlGet = useMemo(() => new Set(urlTrade.get), [urlTrade.get]);
    // The reader's own picks win once they have made one.
    const giving = myGive ?? fromUrlGive;
    const getting = theirGive ?? fromUrlGet;

    const fromUrlGivePicks = useMemo(
        () => new Set(urlTrade.givePicks ?? []), [urlTrade.givePicks]);
    const fromUrlGetPicks = useMemo(
        () => new Set(urlTrade.getPicks ?? []), [urlTrade.getPicks]);
    const givingPicks = myPicks ?? fromUrlGivePicks;
    const gettingPicks = theirPicks ?? fromUrlGetPicks;

    const myKey = league.connection?.teamKey ?? null;

    /** Every team's whole roster, resolved to our own player ids. */
    const teams = useMemo(() => {
        const snap = league.snapshot;
        if (!snap) return null;
        const espn = league.connection?.platform === 'espn';
        const byPlatformId = new Map(players.map(p =>
            [String(espn ? p.espn_nfl_id : p.sleeper_id), p]));
        return snap.teams.map(t => {
            const starting = new Set<number>();
            const roster: TradeRosterPlayer[] = [];
            for (const s of t.slots) {
                const hit = byPlatformId.get(String(s.playerId));
                if (!hit) continue;
                roster.push({
                    id: hit.id,
                    name: hit.full_name ?? String(hit.id),
                    position: hit.position ?? '',
                    // The sync has already dropped injured reserve and taxi,
                    // so whoever is left here can be started.
                    startable: true,
                });
                if (s.starting) starting.add(hit.id);
            }
            return { key: t.key, name: t.name, roster, starting, record: t.record };
        });
    }, [league.snapshot, league.connection?.platform, players]);

    /** The lineup shape, which is what makes a player startable or spare. */
    const slots = useMemo(() => {
        const rp = league.snapshot?.rosterPositions;
        if (!rp?.length) return DEFAULT_SLOTS;
        return rp.filter(s => !BENCH_SLOTS.has(s.toUpperCase()));
    }, [league.snapshot?.rosterPositions]);

    /**
     * The best few free agents at each position, so a roster spot has a price.
     *
     * The finder used to treat a roster as closed: a trade that left somebody
     * over the limit was thrown away rather than costed, which on a full
     * roster — the normal state of a league — removed every uneven offer from
     * the list. Consolidation became unreachable in exactly the leagues people
     * play in.
     *
     * Pricing the spot needs to know what filling it is worth, and that is the
     * best player nobody owns. The pool is free: the board already carries
     * every projected player and the league already knows who is rostered, so
     * the difference is a set operation rather than a request.
     *
     * The projections are not free, though. A mean comes from the start/sit
     * endpoint, which is fed the rostered ids only — so an unrostered player
     * silently scores zero, which would have made every roster spot worthless
     * and looked exactly like the feature working. So these ids join that
     * request.
     *
     * A handful per position rather than the whole pool, because replacement
     * level is the best available and nothing below him changes it. Six is
     * enough to survive a couple of them being unprojected, and keeps this to
     * a few dozen ids on a request that already chunks.
     */
    const freeAgents = useMemo(() => {
        const taken = new Set<number>();
        for (const t of teams ?? []) for (const p of t.roster) taken.add(p.id);
        if (taken.size === 0) return [] as RedraftPlayer[];
        const byPosition = new Map<string, RedraftPlayer[]>();
        for (const p of players) {
            if (taken.has(p.id) || p.proj_points == null) continue;
            const pos = (p.position ?? '').toUpperCase();
            if (!pos) continue;
            byPosition.set(pos, [...(byPosition.get(pos) ?? []), p]);
        }
        const out: RedraftPlayer[] = [];
        for (const [, list] of byPosition) {
            out.push(...list
                .sort((a, b) => Number(b.proj_points) - Number(a.proj_points))
                .slice(0, WIRE_DEPTH));
        }
        return out;
    }, [players, teams]);

    // Every rostered player in the league, not just the starters: a trade is
    // about the bench as much as the lineup, and the partner can change
    // without a new request this way.
    const needed = useMemo(() => {
        const ids = new Set<number>();
        for (const t of teams ?? []) for (const p of t.roster) ids.add(p.id);
        for (const p of freeAgents) ids.add(p.id);
        return [...ids].sort((a, b) => a - b);
    }, [teams, freeAgents]);

    const week = league.week;
    // One hook, one cache: every In Season page asks about the same league,
    // so the page a reader lands on second only pays for the ids the first
    // one did not already fetch. It also chunks to the endpoint's own limit,
    // which is the bug four hand-rolled copies of this produced.
    const { data, loading, failed } = useStartSitData(needed, week);

    const ready = needed.length > 0 && data.size > 0 && !failed;

    /** One simulation input per player, built once. */
    const simOf = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]));
        const cache = new Map<number, SimPlayer | null>();
        return (id: number): SimPlayer | null => {
            if (cache.has(id)) return cache.get(id)!;
            const p = byId.get(id);
            const d = data.get(id);
            // A player with no row from the endpoint has no week, and
            // guessing one is how a trade gets evaluated against a lineup
            // nobody ever saw.
            const v = p && d ? simPlayerFrom(simInputFor(p, d, SEASON, horizon, scoring)) : null;
            cache.set(id, v);
            return v;
        };
    }, [players, data, horizon, scoringKey]);

    /** Regular-season weeks still to play, for the toggle to name. */
    const remaining = useMemo(() => {
        const playoffs = league.snapshot?.playoffWeekStart ?? DEFAULT_PLAYOFF_WEEK;
        return Math.max(0, playoffs - (week ?? 1));
    }, [league.snapshot?.playoffWeekStart, week]);

    const meanOf = (id: number) => simOf(id)?.outcome.mean ?? null;
    /** The NFL team a player plays for, for the schedule behind him. */
    const teamOf = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p.nfl_team ?? null]));
        return (id: number) => byId.get(id) ?? null;
    }, [players]);
    /**
     * The league's remaining schedule, so an offer can be judged on the
     * weeks that decide a season as well as on the points.
     */
    const schedule = useSchedule(week, league.snapshot?.playoffWeekStart ?? null);
    /**
     * Stable identities for the finder's inputs.
     *
     * `findTrades` sweeps about thirty-five thousand offers, and it is
     * memoised on its arguments — so an inline arrow for the means and an
     * inline map for the rosters re-created the arguments on every render
     * and re-ran the whole sweep on every click. That is how a click went
     * from 2.3 seconds to 3.1: not a slower search, the same search done
     * again for nothing.
     */
    const finderMean = useCallback(
        (id: number) => simOf(id)?.outcome.mean ?? 0, [simOf]);
    const finderTeams = useMemo(
        () => (teams ?? []).map(t => ({ key: t.key, name: t.name, roster: t.roster })),
        [teams]);

    /**
     * What a roster spot is worth, by position.
     *
     * The best free agent's points a week — the same unit the lineups are
     * measured in, through the same simulation, because a replacement level
     * in different units from the thing it replaces is not a comparison.
     *
     * Absent where nothing came back priced, and the finder then falls back to
     * scoring an empty slot at zero, which is what it always did.
     */
    const wire = useMemo(() => {
        const best = new Map<string, number>();
        for (const p of freeAgents) {
            const mean = simOf(p.id)?.outcome.mean;
            if (mean == null || !Number.isFinite(mean)) continue;
            const pos = (p.position ?? '').toUpperCase();
            if (!pos) continue;
            if (mean > (best.get(pos) ?? -Infinity)) best.set(pos, mean);
        }
        return best.size > 0 ? { best } : undefined;
    }, [freeAgents, simOf]);

    /**
     * Who to price against before the reader has chosen.
     *
     * This week's opponent, who is the team a reader is most likely thinking
     * about, and otherwise the next one along. Derived rather than stored:
     * writing it into state from an effect means the first paint shows no
     * partner and the second shows one, which is a render cascade and a
     * visible flicker for a value that is a pure function of the snapshot.
     */
    const defaultPartner = useMemo(() => {
        if (!teams || !myKey) return null;
        const opp = league.snapshot?.opponentKeyFor?.[myKey];
        return (opp && opp !== myKey && teams.some(t => t.key === opp))
            ? opp
            : teams.find(t => t.key !== myKey)?.key ?? null;
    }, [teams, myKey, league.snapshot?.opponentKeyFor]);

    const partnerKey = partner ?? urlTrade.partner ?? defaultPartner;
    const me = teams?.find(t => t.key === myKey) ?? null;
    const them = teams?.find(t => t.key === partnerKey) ?? null;

    /**
     * What each roster would lose by giving each of its players up.
     *
     * Only the two rosters on screen, because that is all anybody reads and
     * doing the whole league would be twelve rebuilds for ten answers nobody
     * asked for. Keyed by team so switching partner does not recompute mine.
     */
    const costs = useMemo(() => {
        const numeric = (id: number) => simOf(id)?.outcome.mean ?? 0;
        const out = new Map<string, Map<number, number>>();
        for (const t of [me, them]) {
            if (t && !out.has(t.key)) {
                out.set(t.key, replacementCost(slots, t.roster, numeric));
            }
        }
        return out;
    }, [me, them, slots, simOf]);
    const costFor = (key: string | undefined) => {
        const table = key ? costs.get(key) : undefined;
        return table ? (id: number) => table.get(id) ?? null : undefined;
    };

    /**
     * Every roster's positional standing, so an offer can say why it exists.
     *
     * "You are first of twelve at running back and twelfth at tight end;
     * they are the other way round" is the sentence that gets a reply, and a
     * suggestion a reader cannot explain is one they will not send.
     */
    const profiles: TeamProfile[] = useMemo(() => {
        if (!ready || !teams) return [];
        const measured = teams
            .filter(t => t.roster.length > 0)
            .map(t => measureTeam(t.key, t.name, t.roster, slots,
                id => simOf(id)?.outcome ?? null, id => simOf(id)?.outcome ?? null));
        return measured.length >= 2 ? rankLeague(measured) : [];
    }, [ready, teams, slots, simOf]);

    /**
     * How many teams make the playoffs, which is where a trade's real
     * verdict is decided.
     *
     * Where the platform will not say, half the league — the same fallback
     * the Power page uses, and the number is named on the panel so a
     * reader whose league is different knows to discount it.
     */
    const cut = league.snapshot?.playoffTeams
        ?? Math.max(2, Math.round((teams?.length ?? 12) / 2));

    /**
     * The league's own run home, so a trade is judged against the weeks it
     * will actually be played in.
     *
     * It matters more here than anywhere: a trade that adds two points a
     * week is worth a great deal to a team on the cut line with three of
     * the best rosters left to play and almost nothing to the same team
     * with three of the worst. A schedule drawn at random averages that
     * away, which is to average away the reason for asking.
     */
    const games = useLeagueFixtures(league);
    const firstAhead = week ?? 1;
    const lastWeek = firstAhead + remaining - 1;
    const pairs = useMemo(() => {
        const keys = (teams ?? []).map(t => t.key);
        if (!games?.length || keys.length < 2 || remaining <= 0) return null;
        return scheduleUsable(games, keys, firstAhead, lastWeek)
            ? pairingTable(games, keys, firstAhead, lastWeek)
            : null;
    }, [games, teams, remaining, firstAhead, lastWeek]);

    /**
     * The best few suggested offers, priced in the season they change.
     *
     * Points a week is what the two managers are bargaining over; what
     * that is worth to you is a different question, and the one that
     * decides which of six suggestions to send. Both sides of each offer
     * are replaced, because a trade also changes a rival's roster and
     * leaving that out understates it — a weaker contender is a league you
     * finish higher in.
     */
    const [finderOffers, setFinderOffers] = useState<Offer[]>([]);
    const season = useSeasonOdds(league, players, { season: SEASON });
    const baseline = myKey ? season.value?.odds?.get(myKey)?.odds ?? null : null;

    const toPrice = useMemo(() => {
        if (!myKey || !teams || finderOffers.length === 0) return [];
        const byKey = new Map(teams.map(t => [t.key, t]));
        const mine = byKey.get(myKey);
        if (!mine) return [];
        return finderOffers.slice(0, 3).map(o => {
            const them = byKey.get(o.teamKey);
            if (!them) return null;
            const gave = new Set(o.give);
            const got = new Set(o.get);
            const arriving = them.roster.filter(p => got.has(p.id));
            const leaving = mine.roster.filter(p => gave.has(p.id));
            return {
                id: offerKey(o),
                overrides: [
                    { key: myKey,
                      roster: [...mine.roster.filter(p => !gave.has(p.id)), ...arriving] },
                    { key: o.teamKey,
                      roster: [...them.roster.filter(p => !got.has(p.id)), ...leaving] },
                ],
            };
        }).filter((x): x is NonNullable<typeof x> => x != null);
    }, [finderOffers, teams, myKey]);

    const offerWorth = useClaimWorth(season.input, myKey, baseline, toPrice, 3);

    /**
     * The question, packed so it can cross to a worker.
     *
     * Everything here is plain data on purpose — `simOf` is a closure and a
     * closure does not clone, so the players are flattened to pairs and the
     * worker rebuilds the lookup at its end. Null when there is nothing to
     * ask, which is what stops the hook running the league over an empty
     * trade.
     */
    const question: TradeInput | null = useMemo(() => {
        if (!ready || !teams || !me || !them) return null;
        if (giving.size === 0 && getting.size === 0) return null;
        const sims: [number, SimPlayer][] = [];
        for (const t of teams) {
            for (const p of t.roster) {
                const sim = simOf(p.id);
                // Left out rather than sent as null: the worker's lookup
                // returns null for anybody missing, which is the same
                // signal evaluateTrade already reads to report him unpriced.
                if (sim) sims.push([p.id, sim]);
            }
        }
        return {
            teams: teams.map(t => ({
                key: t.key, name: t.name, roster: t.roster, record: t.record,
            })),
            slots,
            a: { teamKey: me.key, give: [...giving] },
            b: { teamKey: them.key, give: [...getting] },
            sims, trials: TRIALS, seed: 23,
            // Only over the rest of the season. Asked of a single week the
            // question is meaningless — one Sunday does not have playoff
            // odds — and answering it anyway would put a number on the page
            // that moves for no reason a reader could follow.
            season: horizon === 'season' && remaining > 0
                ? { remaining, spots: cut, pairs }
                : null,
        };
    }, [ready, teams, me, them, giving, getting, slots, simOf,
        horizon, remaining, cut, pairs]);

    const { result, pending } = useTradeEvaluation(question);

    /**
     * Everyone in the league, by id.
     *
     * Built once rather than scanned per call: both of these are asked for
     * every player in the offer, every row of the verdict and every asset in
     * the market panel, and each call was flattening twelve rosters and
     * walking a hundred and seventy players to answer one of them. Stable
     * too, so the memos that take them hold between renders.
     */
    const byLeagueId = useMemo(() => {
        const out = new Map<number, TradeRosterPlayer>();
        for (const t of teams ?? []) for (const p of t.roster) out.set(p.id, p);
        return out;
    }, [teams]);
    const nameOf = useCallback(
        (id: number) => byLeagueId.get(id)?.name ?? String(id), [byLeagueId]);
    const positionOf = useCallback(
        (id: number) => byLeagueId.get(id)?.position ?? '', [byLeagueId]);

    const toggle = (set: Set<number>, setter: (s: Set<number>) => void) =>
        (id: number) => {
            const next = new Set(set);
            if (next.has(id)) next.delete(id); else next.add(id);
            setter(next);
        };

    /**
     * Whether this league has draft picks worth trading, and who holds them.
     *
     * Gated on the league's own type, because in a redraft league a 2027
     * first is not an asset — every roster is torn up before it is used, and
     * offering one would be theatre. Where the platform will not say (ESPN
     * reports no such field) the reader gets the switch rather than a page
     * that quietly decided their dynasty league has no picks in it.
     */
    const [picksOn, setPicksOn] = useState<boolean | null>(null);
    const platformKind = league.snapshot?.leagueKind ?? null;
    const picksEnabled = picksOn ?? hasPicks(platformKind);
    /** True where nothing said, so the switch is worth showing. */
    const kindUnknown = platformKind == null;
    /**
     * Whether pick ownership was actually read, or assumed.
     *
     * An empty list of trades and a platform with no endpoint for them look
     * identical from here, so the honest reading is "read it where the
     * platform is one that reports it". Sleeper is; ESPN is not.
     */
    const ownershipRead = league.connection?.platform !== 'espn';

    const superflex = useMemo(() => superflexLeague(slots), [slots]);

    /**
     * The next three rookie drafts, which is as far as the market prices.
     *
     * Taken from the feed rather than counted forward from today, so the
     * seasons on the page are exactly the seasons there is a price for and
     * no row ever reads as a pick worth nothing.
     */
    const pickSeasons = useMemo(() => {
        const seasons = [...new Set(prices.picks.map(p => p.season))]
            .filter(s => s > SEASON)
            .sort((a, b) => a - b);
        return seasons;
    }, [prices.picks]);

    const picksByTeam = useMemo(() => {
        if (!picksEnabled || !teams || pickSeasons.length === 0) return null;
        const rounds = Math.min(
            league.snapshot?.draftRounds ?? 4,
            Math.max(...prices.picks.map(p => p.round)),
        );
        if (rounds < 1) return null;
        return pickInventory({
            teamKeys: teams.map(t => t.key),
            teamNames: new Map(teams.map(t => [t.key, t.name])),
            records: new Map(teams.map(t => [t.key, t.record
                ? { wins: t.record.wins, losses: t.record.losses,
                    ties: t.record.ties, pointsFor: t.record.pointsFor }
                : null])),
            seasons: pickSeasons,
            rounds,
            traded: league.snapshot?.pickTrades ?? [],
            prices: prices.picks,
            superflex,
            // How much of the regular season has been played, which is what
            // decides whether the next draft's order can be projected at all
            // and how much of the projection the record gets to carry.
            played: Math.max(0, (week ?? 1) - 1),
            total: Math.max(0, (league.snapshot?.playoffWeekStart
                ?? DEFAULT_PLAYOFF_WEEK) - 1),
        });
    }, [picksEnabled, teams, pickSeasons, prices.picks, superflex, week,
        league.snapshot?.draftRounds, league.snapshot?.pickTrades,
        league.snapshot?.playoffWeekStart]);

    /** The market's price for a player, in this league's format. */
    const priceOfPlayer = useMemo(() => {
        const by = new Map(prices.players.map(([id, v1, sf]) => [id, superflex ? sf : v1]));
        return (id: number) => by.get(id) ?? null;
    }, [prices.players, superflex]);

    /**
     * Everything on the table, priced on the market's scale.
     *
     * Players and picks together, because the market total is only a
     * comparison if both halves are on it — "you gain a 2027 1st" without
     * what the receiver leaving was worth is not a sentence about a trade.
     */
    const marketGive: PricedAsset[] = useMemo(() => {
        const mine = picksByTeam && me ? picksByTeam.get(me.key) ?? [] : [];
        return [
            ...[...giving].map(id => ({
                key: `p${id}`, name: nameOf(id),
                value: priceOfPlayer(id), pick: false,
            })),
            ...[...givingPicks]
                .map(id => findPick(mine, id))
                .filter((p): p is PickAsset => p != null)
                .map(p => ({ key: p.id, name: pickName(p), value: p.value, pick: true })),
        ];
    }, [giving, givingPicks, picksByTeam, me, priceOfPlayer, nameOf]);

    const marketGet: PricedAsset[] = useMemo(() => {
        const theirs = picksByTeam && them ? picksByTeam.get(them.key) ?? [] : [];
        return [
            ...[...getting].map(id => ({
                key: `p${id}`, name: nameOf(id),
                value: priceOfPlayer(id), pick: false,
            })),
            ...[...gettingPicks]
                .map(id => findPick(theirs, id))
                .filter((p): p is PickAsset => p != null)
                .map(p => ({ key: p.id, name: pickName(p), value: p.value, pick: true })),
        ];
    }, [getting, gettingPicks, picksByTeam, them, priceOfPlayer, nameOf]);

    /**
     * The picks on each side, shortened for the bar at the foot of the page.
     * "2027 1st" rather than the full "(from Dave)" name, because that bar
     * is one line and the name is only there to give the numbers a subject.
     */
    const shortPicks = (list: PickAsset[], chosen: Set<string>) =>
        [...chosen]
            .map(id => findPick(list, id))
            .filter((p): p is PickAsset => p != null)
            .map(p => `${p.season} ${p.label}`);
    const givePickLabels = useMemo(
        () => shortPicks(picksByTeam && me ? picksByTeam.get(me.key) ?? [] : [],
            givingPicks),
        [picksByTeam, me, givingPicks]);
    const getPickLabels = useMemo(
        () => shortPicks(picksByTeam && them ? picksByTeam.get(them.key) ?? [] : [],
            gettingPicks),
        [picksByTeam, them, gettingPicks]);

    /**
     * What the finder needs to look for a trade between two managers who
     * want different things: a price for every player, and the picks each
     * roster is holding.
     *
     * Null in a redraft league and in a league too early to have picks,
     * which is what keeps the stance control off those pages rather than
     * offering a search that cannot return anything.
     */
    const finderMarket = useMemo(() => {
        if (!picksByTeam || !myKey) return undefined;
        const asPicks = (list: PickAsset[]): FinderPick[] => list.map(p => ({
            id: p.id, label: `${p.season} ${p.label}`, value: p.value,
        }));
        return {
            valueOfPlayer: priceOfPlayer,
            myPicks: asPicks(picksByTeam.get(myKey) ?? []),
            picksByTeam: new Map([...picksByTeam].map(
                ([k, list]) => [k, asPicks(list)])),
        };
    }, [picksByTeam, myKey, priceOfPlayer]);

    /** A pick id as the finder should print it. */
    const pickLabelOf = useCallback((id: string) => {
        const parsed = parsePickId(id);
        return parsed ? `${parsed.season} ${roundLabel(parsed.round)}` : id;
    }, []);

    const togglePick = (set: Set<string>, setter: (s: Set<string>) => void) =>
        (id: string) => {
            const next = new Set(set);
            if (next.has(id)) next.delete(id); else next.add(id);
            setter(next);
        };

    /**
     * Every rostered player in the league, for the search box.
     *
     * The whole league rather than the two rosters on screen, because the
     * question the box exists to answer is which manager holds the player
     * you want — and that cannot be answered out of a list you already
     * chose the teams for.
     */
    const searchHits: SearchHit[] = useMemo(() => {
        if (!teams) return [];
        const out: SearchHit[] = [];
        for (const t of teams) {
            for (const p of t.roster) {
                out.push({
                    kind: 'player',
                    id: p.id, name: p.name, position: p.position,
                    teamKey: t.key, teamName: t.name,
                    starting: t.starting.has(p.id),
                    mean: simOf(p.id)?.outcome.mean ?? null,
                    onTable: (t.key === myKey && giving.has(p.id))
                        || (t.key === partnerKey && getting.has(p.id)),
                });
            }
            // Picks too, where the league has them. Without this, "who holds
            // a 2027 first" was answerable only by selecting each manager in
            // turn and reading their holdings — the exact scroll this box was
            // built to replace, reintroduced the moment picks became
            // tradeable.
            for (const k of picksByTeam?.get(t.key) ?? []) {
                out.push({
                    kind: 'pick',
                    id: k.id,
                    name: `${k.season} ${k.label}`,
                    teamKey: t.key, teamName: t.name,
                    value: k.value,
                    slot: k.projection?.slot ?? null,
                    onTable: (t.key === myKey && givingPicks.has(k.id))
                        || (t.key === partnerKey && gettingPicks.has(k.id)),
                });
            }
        }
        return out;
    }, [teams, simOf, myKey, partnerKey, giving, getting,
        picksByTeam, givingPicks, gettingPicks]);

    /**
     * A search hit, put on the side of the table it belongs to.
     *
     * Wanting a player and wanting to trade with whoever holds him are the
     * same wish, so a hit on a third manager's roster switches the partner
     * rather than asking the reader to go and do it. What was asked of the
     * old partner goes with them: those ids are players on a roster that is
     * no longer on screen, and carrying them over would price an offer
     * against two managers at once.
     */
    const pickFromSearch = useCallback((hit: SearchHit) => {
        const mine = hit.teamKey === myKey;
        const theirs = hit.teamKey === partnerKey;
        if (hit.kind === 'pick') {
            if (mine) { setMyPicks(new Set(givingPicks).add(hit.id)); return; }
            if (theirs) { setTheirPicks(new Set(gettingPicks).add(hit.id)); return; }
            // A pick on a third manager's shelf: switching to them takes the
            // players asked of the old partner with it, the same as picking
            // one of their players does.
            setPartner(hit.teamKey);
            setTheirGive(new Set());
            setTheirPicks(new Set([hit.id]));
            return;
        }
        if (mine) { setMyGive(new Set(giving).add(hit.id)); return; }
        if (theirs) { setTheirGive(new Set(getting).add(hit.id)); return; }
        setPartner(hit.teamKey);
        setTheirGive(new Set([hit.id]));
        setTheirPicks(new Set());
    }, [myKey, partnerKey, giving, getting, givingPicks, gettingPicks]);

    /**
     * Keep the address bar holding the trade on screen.
     *
     * This page is the one place here where the output is meant to leave the
     * app: the question it answers is whether to send an offer to another
     * manager, and until now the answer lived in a URL that said nothing
     * about it. A refresh emptied the table, and there was no way to put the
     * exact offer in front of the person who has to accept it.
     *
     * Written with replace rather than push so that picking six players in a
     * row leaves one entry in the history and the back button returns to
     * wherever the reader came from, not through six versions of this page.
     *
     * And written through history rather than through the router, which is
     * the whole reason this took two attempts. The page is force-dynamic, so
     * `router.replace` goes back to the server for it, the server component
     * re-renders, this component remounts, and every player you had picked
     * is gone — the URL would fill in with the partner and then sit there
     * saying `?with=8` for ever, because the state that would have written
     * the rest of it had just been thrown away by the act of writing it.
     * `history.replaceState` changes the address and nothing else, and Next
     * still reports it through `useSearchParams`.
     */
    const href = tradeHref('/in-season/trades', {
        partner: partnerKey, give: [...giving], get: [...getting],
        givePicks: [...givingPicks], getPicks: [...gettingPicks],
    });
    useEffect(() => {
        if (!ready) return;
        const here = `${window.location.pathname}${window.location.search}`;
        if (here !== href) window.history.replaceState(null, '', href);
    }, [href, ready]);

    /** The two rows the trade is actually about. */
    const traders = result?.effects.filter(e => e.trading) ?? [];
    const mineEffect = traders.find(e => e.key === myKey) ?? null;
    const theirsEffect = traders.find(e => e.key !== myKey) ?? null;

    /**
     * An offer kept still while you build the next one.
     *
     * Dropped whenever the horizon or the week moves under it, because a
     * verdict priced over the rest of the season and one priced over this
     * Sunday are not two answers to the same question, and showing them in
     * adjacent columns would invite exactly that reading.
     */
    const [heldRaw, setHeld] = useState<HeldOffer | null>(null);
    // Derived rather than cleared from an effect: a hold priced over a
    // different horizon simply is not a hold any more, and saying so here
    // is one line where syncing it through state is a render cascade and a
    // frame where the stale pair is on screen together.
    const held = heldRaw
        && heldRaw.horizon === horizon
        && heldRaw.week === (week ?? null)
        ? heldRaw : null;

    const sameAsHeld = held != null
        && held.partnerKey === partnerKey
        && held.give.length === giving.size
        && held.get.length === getting.size
        && held.give.every(id => giving.has(id))
        && held.get.every(id => getting.has(id))
        // Picks count towards "the same offer" even though they do not move
        // the odds: two offers differing only by a 2027 first are not the
        // same offer, and treating them as one would put the pin on both.
        && (held.givePicks ?? []).length === givingPicks.size
        && (held.getPicks ?? []).length === gettingPicks.size
        && (held.givePicks ?? []).every(id => givingPicks.has(id))
        && (held.getPicks ?? []).every(id => gettingPicks.has(id));

    const hold = useCallback(() => {
        if (sameAsHeld) { setHeld(null); return; }
        if (!result || !them) return;
        setHeld({
            partnerKey: them.key, partnerName: them.name,
            give: [...giving], get: [...getting],
            givePicks: [...givingPicks], getPicks: [...gettingPicks],
            mine: mineEffect, theirs: theirsEffect,
            horizon, week: week ?? null,
        });
    }, [sameAsHeld, result, them, giving, getting, givingPicks, gettingPicks,
        mineEffect, theirsEffect, horizon, week]);

    const restore = useCallback(() => {
        if (!held) return;
        setPartner(held.partnerKey);
        setMyGive(new Set(held.give));
        setTheirGive(new Set(held.get));
        setMyPicks(new Set(held.givePicks ?? []));
        setTheirPicks(new Set(held.getPicks ?? []));
    }, [held]);

    const clear = useCallback(() => {
        setMyGive(new Set());
        setTheirGive(new Set());
        setMyPicks(new Set());
        setTheirPicks(new Set());
    }, []);

    /**
     * The verdict panel, and whether the reader can currently see it.
     *
     * The bar at the foot of the page stands in for it while it is off
     * screen and gets out of the way once it is not, so the two are never
     * both asking to be read.
     */
    const [verdictEl, setVerdictEl] = useState<HTMLDivElement | null>(null);
    const verdictOffscreen = useOutOfView(verdictEl);
    const showDetail = useCallback(() => {
        verdictEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [verdictEl]);

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[660px]">
                    Every trade analyser answers with value, which is the wrong
                    question: a roster is not a pile of value, it is a lineup with a
                    fixed shape, and a third receiver in a league that starts two is
                    worth almost nothing. Connect a league and a trade is judged on
                    what it does instead — both lineups re-filled, the whole league
                    replayed, and the change in how often you win.
                </p>
                <LeagueConnect league={league} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />
            <HorizonToggle value={horizon} onChange={setHorizon} remaining={remaining} />

            {failed ? (
                <p className="text-[12px] py-3" style={{ color: '#FCA5A5' }}>
                    Could not price every roster in the league, so a trade cannot be
                    judged against it. Reload to try again.
                </p>
            ) : !ready ? (
                <p className="text-[12px] text-muted-foreground/55 py-3">
                    {loading
                        ? 'Reading every roster in the league…'
                        : 'Waiting for rosters.'}
                </p>
            ) : (
                <>
                    {/* Found before priced. The analyser is for a trade you
                        have already thought of; this is for the one you have
                        not, which is the one nobody makes. */}
                    {me && teams && (
                        <TradeFinder
                            worth={offerWorth.byPlayer}
                            onOffers={setFinderOffers}
                            myRoster={me.roster}
                            teams={finderTeams}
                            slots={slots} meanOf={finderMean}
                            nameOf={nameOf} positionOf={positionOf}
                            teamOf={teamOf} playoffs={schedule.playoffs}
                            profiles={profiles} myKey={myKey}
                            rosterSize={league.snapshot?.rosterPositions?.length}
                            partnerKey={partnerKey}
                            market={finderMarket} wire={wire} pickLabel={pickLabelOf}
                            onPick={(o: Offer) => {
                                // Loading an offer sets the partner as well,
                                // or the analyser would price it against
                                // whoever happened to be selected.
                                setPartner(o.teamKey);
                                setMyGive(new Set(o.give));
                                setTheirGive(new Set(o.get));
                                // Picks and all. A buy-stance suggestion IS
                                // picks — that is what paying the other
                                // manager means — so loading one without them
                                // put a bench body against their best player
                                // and priced it as a gift, while the row the
                                // reader had just clicked showed the price.
                                // Whatever was on the table before is gone
                                // either way: a loaded suggestion is the
                                // whole offer, not an addition to one.
                                setMyPicks(new Set(o.givePicks));
                                setTheirPicks(new Set(o.getPicks));
                                if (typeof window !== 'undefined') {
                                    window.scrollBy({ top: 220, behavior: 'smooth' });
                                }
                            }} />
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] text-muted-foreground/60"
                            htmlFor="trade-partner">
                            Trade with
                        </label>
                        <select id="trade-partner"
                            value={partnerKey ?? ''}
                            onChange={e => {
                                setPartner(e.target.value);
                                setTheirGive(new Set());
                                // Their picks go with them: the ids name a
                                // holding that is no longer on screen.
                                setTheirPicks(new Set());
                            }}
                            className="text-[12px] font-semibold rounded-lg px-2 py-1
                                       bg-black/40 border border-white/10">
                            {(teams ?? []).filter(t => t.key !== myKey).map(t => (
                                <option key={t.key} value={t.key}>{t.name}</option>
                            ))}
                        </select>
                        {(giving.size > 0 || getting.size > 0
                            || givingPicks.size > 0 || gettingPicks.size > 0) && (
                            <button type="button"
                                onClick={clear}
                                className="text-[11px] px-2 py-1 rounded-lg
                                           border border-white/10 text-muted-foreground/70
                                           hover:text-foreground hover:bg-white/[0.05]">
                                Clear
                            </button>
                        )}
                        {/* Only where the platform would not say. Where it
                            did, the league's own setting decides and a
                            switch would just be a way to get it wrong. */}
                        {kindUnknown && pickSeasons.length > 0 && (
                            <label className="text-[11px] text-muted-foreground/55
                                              inline-flex items-center gap-1.5 ml-auto
                                              cursor-pointer"
                                title="Your platform does not report whether this is a
                                       dynasty league, so picks are off until you say">
                                <input type="checkbox" checked={picksEnabled}
                                    data-toggle="picks"
                                    onChange={e => setPicksOn(e.target.checked)}
                                    className="accent-white/70" />
                                Trade draft picks
                            </label>
                        )}
                    </div>

                    <PlayerSearch hits={searchHits} myKey={myKey}
                        partnerKey={partnerKey} onPick={pickFromSearch}
                        horizon={horizon} />

                    <div className="grid gap-3 lg:grid-cols-2">
                        {me && (
                            <RosterPicker
                                title={`${me.name} — you`}
                                subtitle="pick who you would send"
                                roster={me.roster} starting={me.starting}
                                selected={giving} meanOf={meanOf} horizon={horizon}
                                costOf={costFor(me.key)}
                                onToggle={toggle(giving, setMyGive)}>
                                {picksByTeam && (
                                    <PickPicker
                                        picks={picksByTeam.get(me.key) ?? []}
                                        selected={givingPicks}
                                        onToggle={togglePick(givingPicks, setMyPicks)} />
                                )}
                            </RosterPicker>
                        )}
                        {them && (
                            <RosterPicker
                                title={them.name}
                                subtitle="pick who you would want"
                                roster={them.roster} starting={them.starting}
                                selected={getting} meanOf={meanOf} horizon={horizon}
                                costOf={costFor(them.key)}
                                onToggle={toggle(getting, setTheirGive)}>
                                {picksByTeam && (
                                    <PickPicker
                                        picks={picksByTeam.get(them.key) ?? []}
                                        selected={gettingPicks}
                                        onToggle={togglePick(gettingPicks, setTheirPicks)} />
                                )}
                            </RosterPicker>
                        )}
                    </div>

                    {/* Once, under both panels, rather than once inside each
                        — it says the same thing about either manager's picks
                        and sits directly above the market panel it refers to. */}
                    {picksByTeam && me && them && (
                        <PickNote
                            picks={[...(picksByTeam.get(me.key) ?? []),
                                ...(picksByTeam.get(them.key) ?? [])]}
                            unknownOwnership={!ownershipRead} />
                    )}

                    {picksEnabled && (marketGive.length > 0 || marketGet.length > 0) && (
                        <MarketValue give={marketGive} get={marketGet}
                            superflex={superflex}
                            partnerName={them?.name ?? ''} />
                    )}

                    {held && (
                        <TradeCompare held={held} nameOf={nameOf}
                            pickLabel={pickLabelOf}
                            current={result && them ? {
                                give: [...giving], get: [...getting],
                                givePicks: [...givingPicks], getPicks: [...gettingPicks],
                                partnerName: them.name,
                                mine: mineEffect, theirs: theirsEffect,
                            } : null}
                            onRestore={restore} onDrop={() => setHeld(null)} />
                    )}

                    {result ? (
                        <div ref={setVerdictEl} aria-busy={pending}
                            className={pending
                                ? 'opacity-50 transition-opacity'
                                : 'transition-opacity'}>
                            <TradeVerdict result={result} myKey={myKey}
                                nameOf={nameOf} positionOf={positionOf} trials={TRIALS}
                                horizon={horizon} spots={cut} realSchedule={pairs != null}
                                spotsKnown={league.snapshot?.playoffTeams != null} />
                        </div>
                    ) : (
                        <p className="text-[12px] text-muted-foreground/50 py-2">
                            Pick a player from either roster. A one-sided offer is a
                            real thing to price too — it is what a waiver claim or a
                            straight gift looks like.
                        </p>
                    )}

                    {/* So the bar never rests on top of the last thing on the
                        page, which on a phone is the sentence explaining the
                        number it is showing. */}
                    {result && <div aria-hidden="true" className="h-28 sm:h-16" />}

                    <TradeSummaryBar
                        mine={mineEffect} theirs={theirsEffect}
                        partnerName={them?.name ?? ''}
                        give={[...giving]} get={[...getting]}
                        givePicks={givePickLabels} getPicks={getPickLabels}
                        nameOf={nameOf}
                        href={href}
                        visible={result != null && verdictOffscreen}
                        pending={pending}
                        pinned={sameAsHeld} onPin={hold} onClear={clear}
                        onSeeDetail={showDetail} />
                </>
            )}
        </div>
    );
}
