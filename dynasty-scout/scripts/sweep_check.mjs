/**
 * Every In Season page, in one pass, asserting that each still has all of
 * its panels.
 *
 * This exists because of how the last three faults here were found: not by
 * a check, but by the owner looking at his own league and saying "this is
 * still what I see on Team Analysis". Team Analysis was rendering its
 * depth table and nothing else, Power Rankings was week-by-week when it
 * was meant to be rest-of-season, and the waiver wire was listing men who
 * were not available. Every one of those pages answered, returned 200,
 * threw no error and passed every check we had — they were simply missing
 * most of what they are for.
 *
 * So the assertion is the list of panels, not the absence of a crash. A
 * page that loses a section fails here, which is the only automatic way to
 * catch a feature that quietly stops rendering. It is deliberately a whole
 * sweep rather than a check per page: the fault nobody finds is on the
 * page nobody happened to be working on.
 *
 * Both widths, because a panel that collapses on a phone is also missing.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const LEAGUE_ID='1388633751839309824', WEEK=8, PLAYOFFS=15;
const IDS=F.rosters[LEAGUE_ID].map(r=>r.roster_id);
let seed=11; const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const STR=Object.fromEntries(IDS.map((id,i)=>[id,132-i*2.6]));
const sched={}; { const ring=IDS.slice();
  for(let w=1;w<PLAYOFFS;w++){sched[w]=[];for(let i=0;i<ring.length/2;i++)sched[w].push([ring[i],ring[ring.length-1-i]]);ring.splice(1,0,ring.pop());}}
const st=new Map(F.rosters[LEAGUE_ID].map(r=>[r.roster_id,r]));
const mk=w=>sched[w].flatMap(([a,b],i)=>[a,b].map(id=>({roster_id:id,matchup_id:i+1,
  starters:st.get(id)?.starters??null,players:st.get(id)?.players??null,
  points:w<WEEK?Math.round((STR[id]+(rand()-0.5)*44)*100)/100:0})));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1400,height:1100}});
await ctx.route('**/api/sleeper/**',route=>{
  const u=new URL(route.request().url()).pathname.replace('/api/sleeper','');
  const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('/state/nfl'))return j({week:WEEK,display_week:WEEK});
  if(/\/user\/[^/]+\/leagues/.test(u))return j(F.leagues);
  if(/\/user\/txmossad$/.test(u))return j(F.user);
  if(/\/user\/[^/]+$/.test(u))return route.fulfill({status:404,body:'null'});
  let m;
  if((m=u.match(/\/league\/(\d+)\/rosters/)))return j(F.rosters[m[1]]??[]);
  if((m=u.match(/\/league\/(\d+)\/users/)))return j(F.users[m[1]]??[]);
  if((m=u.match(/\/league\/(\d+)\/matchups\/(\d+)/)))return j(m[1]===LEAGUE_ID?mk(Number(m[2])):[]);
  if((m=u.match(/\/league\/(\d+)$/))){const d=F.leagueDetail[m[1]];return j(d?{...d,settings:{...d.settings,playoff_week_start:PLAYOFFS}}:null);}
  return j(null);
});
await ctx.route('https://api.sleeper.app/**',r=>r.abort());
const p=await ctx.newPage(); p.setDefaultTimeout(40000);
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:3090/in-season/power',{waitUntil:'domcontentloaded'});
const find=p.getByRole('button',{name:/^find$/i});
for(let i=0;i<8;i++){try{await p.getByPlaceholder(/sleeper username/i).fill('txmossad',{timeout:6000});if(await find.isEnabled())break;}catch{}await p.waitForTimeout(1200);}
await find.click();
await p.getByRole('button',{name:/Den Fantasy Football League 1/}).first().click();
await p.getByRole('button',{name:/^Jebdaddybush$/}).first().click();
await p.waitForTimeout(15000);
const fails = [];
const assert = (label, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};

/**
 * What each page is for, as the headings it must be showing.
 *
 * All of them, not any: a page that has lost one panel still has the rest,
 * which is exactly the state that reads as working and is not.
 */
const PAGES = [
    ['Start/Sit', 'startsit', [
        /chance you win week/i,
        /your lineup, slot by slot/i,
        /slot by slot, against theirs/i,
        /your bench/i,
        /is worth[\s\S]{0,40}playoff odds/i,
    ]],
    ['Waiver Wire', 'waivers', [
        /your weakest against the best available/i,
        /best available in your league/i,
    ]],
    ['Power Rankings', 'power', [
        /every roster against every other/i,
        /what week \d+ is worth/i,
        /earned, or not/i,
        /the run home/i,
    ]],
    ['Team Analysis', 'team', [
        /where this roster stands in the league/i,
        /where the points come from/i,
        /what sort of team it is/i,
        /the schedule ahead, position by position/i,
        /if he goes down, who takes the work/i,
    ]],
    ['Trade Analyzer', 'trades', [
        /offers both sides gain from/i,
    ]],
    ["Pick'ems", 'pickems', [
        /this week.s picks, most confident first/i,
        /every bucket, and why the two columns/i,
    ]],
];

for (const [label, slug, wanted] of PAGES) {
    console.log(`\n── ${slug}`);
    await p.getByRole('link', { name: label }).first().click();
    await p.waitForTimeout(13000);
    const txt = await p.locator('body').innerText();
    const missing = wanted.filter(re => !re.test(txt));
    assert('every panel is on the page', missing.length === 0,
        missing.length
            ? `missing ${missing.length} of ${wanted.length}: `
              + missing.map(String).join(' ')
            : `${wanted.length} panels`);
    assert('nothing reads as empty',
        !/Nothing here|could not be priced|unavailable/i.test(txt));

    const over = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert('no horizontal overflow', over <= 1, `${over}px`);
    await p.screenshot({ path: `${process.argv[2] ?? '/tmp'}/sw-${slug}.png`, fullPage: true });

    await p.setViewportSize({ width: 390, height: 900 });
    await p.waitForTimeout(2000);
    const overP = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert('nor at phone width', overP <= 1, `${overP}px`);
    const phone = await p.locator('body').innerText();
    const gone = wanted.filter(re => !re.test(phone));
    assert('and the panels are still there on a phone', gone.length === 0,
        gone.length ? `${gone.length} missing` : `${wanted.length} panels`);
    await p.screenshot({ path: `${process.argv[2] ?? '/tmp'}/sw-${slug}-phone.png`, fullPage: true });
    await p.setViewportSize({ width: 1400, height: 1100 });
    await p.waitForTimeout(800);
}

console.log('\n── the whole journey');
assert('no page errors anywhere', errs.length === 0,
    errs.length ? errs.slice(0, 2).join(' | ') : 'none');
await b.close();
console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
