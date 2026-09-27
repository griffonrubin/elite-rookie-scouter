/**
 * Where a future pick is projected to land, and whether that is defensible.
 *
 * The market prices a 2027 first at 4,477 early and 2,290 late. So a slot
 * projection is a near-doubling of an asset's value on the strength of a
 * ranking, which makes it the most dangerous number added to the trade page
 * — it is the one a reader cannot check and would have no reason to doubt.
 *
 * What is checked here is therefore not "it produces a slot". It is that the
 * projection is a permutation of the draft (nobody is given somebody else's
 * pick), that it reads the draft the right way up (the worst team picks
 * first, which is the whole mechanism and the easiest thing to invert), that
 * points scored genuinely moves it rather than decorating a ranking made of
 * record alone, that the weighting collapses to the standings themselves by
 * the last week, and that a season too young to know refuses to guess.
 */
import {
    PROJECTION_MIN_GAMES, pickInventory, priceOf, projectDraftOrder,
    recordWeightFor, slotForPick, type PickPrice, type TeamForm,
} from '../lib/tradePicks';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

/** Twelve teams, strictly ordered: team 1 best, team 12 worst, on both measures. */
function ladder(games = 10): { key: string; form: TeamForm }[] {
    return Array.from({ length: 12 }, (_, i) => ({
        key: String(i + 1),
        form: {
            wins: 12 - i > games ? games : 12 - i,
            losses: games - (12 - i > games ? games : 12 - i),
            ties: 0,
            pointsFor: 1500 - i * 40,
        },
    }));
}

step(1, 'the draft is read the right way up');
{
    const p = projectDraftOrder({ teams: ladder(), played: 10, total: 14 });
    const best = p.get('1')!;
    const worst = p.get('12')!;
    console.log(`      best team → pick ${best.pick} (${best.slot}), `
        + `worst → pick ${worst.pick} (${worst.slot})`);
    assert('the worst team picks first', worst.pick === 1, `pick ${worst.pick}`);
    assert('and that is an early pick', worst.slot === 'early', worst.slot);
    assert('the best team picks last', best.pick === 12, `pick ${best.pick}`);
    assert('and that is a late pick', best.slot === 'late', best.slot);
}

step(2, 'every team gets exactly one pick, and they are all different');
{
    const p = projectDraftOrder({ teams: ladder(), played: 10, total: 14 });
    const picks = [...p.values()].map(v => v.pick).sort((a, b) => a - b);
    assert('twelve teams, twelve projections', p.size === 12, String(p.size));
    assert('the picks are 1 to 12 with nothing repeated or missing',
        JSON.stringify(picks) === JSON.stringify(
            Array.from({ length: 12 }, (_, i) => i + 1)),
        picks.join(','));
}

step(3, 'points scored actually moves it');
{
    // A team with the worst record in the league and the most points in it:
    // the unluckiest kind of team there is, and the one a record-only
    // ranking hands an early first it will not get.
    const teams = ladder(10);
    teams[11].form.pointsFor = 2000;   // worst record, best points
    const early = projectDraftOrder({ teams, played: 4, total: 14 });
    const late = projectDraftOrder({ teams, played: 13, total: 14 });
    const e = early.get('12')!;
    const l = late.get('12')!;
    console.log(`      record rank ${e.recordRank}, points rank ${e.pointsRank}; `
        + `week 5 → pick ${e.pick} (w=${e.recordWeight.toFixed(2)}), `
        + `week 14 → pick ${l.pick} (w=${l.recordWeight.toFixed(2)})`);
    assert('it is last on record and first on points',
        e.recordRank === 12 && e.pointsRank === 1,
        `${e.recordRank} / ${e.pointsRank}`);
    assert('early in the season the points pull it away from pick one',
        e.pick > 1, `pick ${e.pick}`);
    assert('late in the season the record wins and it picks first',
        l.pick === 1, `pick ${l.pick}`);
    assert('so the projection moved as the season went on', e.pick !== l.pick,
        `${e.pick} → ${l.pick}`);
}

step(4, 'the weighting collapses to the standings by the last week');
{
    assert('nothing at kickoff', recordWeightFor(0, 14) === 0);
    assert('half way is half', recordWeightFor(7, 14) === 0.5);
    assert('everything at the finish', recordWeightFor(14, 14) === 1);
    assert('and it cannot exceed one', recordWeightFor(20, 14) === 1);

    // At full weight the order must be exactly the standings reversed, with
    // points having no say beyond breaking a tie.
    const teams = ladder(14);
    teams[11].form.pointsFor = 9999;
    const p = projectDraftOrder({ teams, played: 14, total: 14 });
    assert('the worst record picks first however many points it scored',
        p.get('12')!.pick === 1, `pick ${p.get('12')!.pick}`);
}

step(5, 'a season too young refuses to guess');
{
    for (const played of [0, 1, PROJECTION_MIN_GAMES - 1]) {
        const p = projectDraftOrder({ teams: ladder(played), played, total: 14 });
        assert(`nothing projected after ${played} game${played === 1 ? '' : 's'}`,
            p.size === 0, `${p.size} projections`);
    }
    const ok = projectDraftOrder({
        teams: ladder(PROJECTION_MIN_GAMES),
        played: PROJECTION_MIN_GAMES, total: 14,
    });
    assert(`and it does project on game ${PROJECTION_MIN_GAMES}`, ok.size === 12,
        `${ok.size} projections`);
}

step(6, 'a league where only some teams have a record is not ranked at all');
{
    const teams: { key: string; form: TeamForm | null }[] = ladder();
    teams[3].form = null;
    const p = projectDraftOrder({ teams, played: 10, total: 14 });
    assert('one missing record and nobody is projected', p.size === 0,
        `${p.size} projections — a partial ranking would sink the unknown `
        + 'team to the band worth the most');
}

step(7, 'the bands are thirds of the round');
{
    const band = (n: number) => Array.from({ length: n }, (_, i) =>
        slotForPick(i + 1, n)).join(',');
    console.log('      12 teams: ' + band(12));
    console.log('      10 teams: ' + band(10));
    assert('twelve teams split 4/4/4',
        band(12) === 'early,early,early,early,mid,mid,mid,mid,late,late,late,late',
        band(12));
    const ten = band(10).split(',');
    assert('ten teams split without a band left holding the remainder',
        ten.filter(x => x === 'early').length === 3
        && ten.filter(x => x === 'mid').length === 4
        && ten.filter(x => x === 'late').length === 3, band(10));
}

step(8, 'the projection changes the price, and only for the next draft');
{
    const prices: PickPrice[] = [
        { season: 2027, round: 1, slot: null, value1qb: 2781, valueSf: 2892 },
        { season: 2027, round: 1, slot: 'early', value1qb: 4477, valueSf: 4656 },
        { season: 2027, round: 1, slot: 'mid', value1qb: 2948, valueSf: 3066 },
        { season: 2027, round: 1, slot: 'late', value1qb: 2290, valueSf: 2382 },
        { season: 2028, round: 1, slot: null, value1qb: 2057, valueSf: 2139 },
    ];
    assert('an early 2027 first is priced early',
        priceOf(prices, 2027, 1, false, 'early') === 4477);
    assert('and with no band it is the unslotted price',
        priceOf(prices, 2027, 1, false, null) === 2781);
    assert('a band the feed does not carry falls back rather than failing',
        priceOf(prices, 2028, 1, false, 'early') === 2057);

    const teams = ladder();
    const inv = pickInventory({
        teamKeys: teams.map(t => t.key),
        teamNames: new Map(teams.map(t => [t.key, `Team ${t.key}`])),
        records: new Map(teams.map(t => [t.key, t.form])),
        seasons: [2027, 2028],
        rounds: 1,
        traded: [],
        prices,
        superflex: false,
        played: 10, total: 14,
    });
    const worst = inv.get('12')!;
    const best = inv.get('1')!;
    const w27 = worst.find(p => p.season === 2027)!;
    const w28 = worst.find(p => p.season === 2028)!;
    const b27 = best.find(p => p.season === 2027)!;
    console.log(`      worst team's 2027 1st: ${w27.projection?.slot} ${w27.value}`);
    console.log(`      best  team's 2027 1st: ${b27.projection?.slot} ${b27.value}`);
    console.log(`      worst team's 2028 1st: ${w28.projection?.slot ?? 'none'} `
        + `${w28.value}`);
    assert('the worst team’s next first is priced as an early one',
        w27.value === 4477, String(w27.value));
    assert('the best team’s is priced as a late one',
        b27.value === 2290, String(b27.value));
    assert('they are worth nearly double one another',
        w27.value! / b27.value! > 1.9, (w27.value! / b27.value!).toFixed(2));
    assert('the draft after next is not projected',
        w28.projection === null && w28.value === 2057,
        `${w28.projection?.slot ?? 'none'} / ${w28.value}`);
}

step(9, 'a traded pick keeps the band of the team it came from');
{
    const prices: PickPrice[] = [
        { season: 2027, round: 1, slot: null, value1qb: 2781, valueSf: 2892 },
        { season: 2027, round: 1, slot: 'early', value1qb: 4477, valueSf: 4656 },
        { season: 2027, round: 1, slot: 'late', value1qb: 2290, valueSf: 2382 },
    ];
    const teams = ladder();
    const inv = pickInventory({
        teamKeys: teams.map(t => t.key),
        teamNames: new Map(teams.map(t => [t.key, `Team ${t.key}`])),
        records: new Map(teams.map(t => [t.key, t.form])),
        seasons: [2027], rounds: 1,
        // The best team in the league has bought the worst team's first.
        traded: [{ season: 2027, round: 1, originalKey: '12', ownerKey: '1' }],
        prices, superflex: false, played: 10, total: 14,
    });
    const held = inv.get('1')!;
    const bought = held.find(p => p.fromKey === '12')!;
    const own = held.find(p => p.fromKey === '1')!;
    console.log(`      bought: ${bought.projection?.slot} ${bought.value}  |  `
        + `own: ${own.projection?.slot} ${own.value}`);
    assert('the pick bought from the worst team is still an early one',
        bought.projection?.slot === 'early' && bought.value === 4477,
        `${bought.projection?.slot} / ${bought.value}`);
    assert('and the buyer’s own first is still late',
        own.projection?.slot === 'late' && own.value === 2290,
        `${own.projection?.slot} / ${own.value}`);
    assert('so one manager holds two firsts worth very different money',
        bought.value !== own.value);
}

console.log(fails.length
    ? `\nFAILED ${fails.length}:\n - ${fails.join('\n - ')}`
    : '\npick_slot_check      ok');
process.exit(fails.length ? 1 : 0);
