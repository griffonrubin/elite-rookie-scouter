'use client';

import { useState } from 'react';
import { JFosterGrades } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
    RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from 'recharts';

interface Props {
    jfoster: JFosterGrades;
    position: string;
}

// Grade color scale
function gradeOf(pct: number) {
    if (pct >= 90) return { label: 'S+', bar: 'bg-yellow-400',   text: 'text-yellow-400',  badge: 'bg-yellow-400/15  text-yellow-400  border-yellow-400/50', stroke: '#facc15', fill: 'rgba(250,204,21,0.18)'  };
    if (pct >= 80) return { label: 'S',  bar: 'bg-yellow-300',   text: 'text-yellow-300',  badge: 'bg-yellow-300/15  text-yellow-300  border-yellow-300/50', stroke: '#fde047', fill: 'rgba(253,224,71,0.18)'  };
    if (pct >= 70) return { label: 'A',  bar: 'bg-emerald-400',  text: 'text-emerald-400', badge: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/50', stroke: '#34d399', fill: 'rgba(52,211,153,0.18)' };
    if (pct >= 58) return { label: 'B+', bar: 'bg-cyan-400',     text: 'text-cyan-400',    badge: 'bg-cyan-400/15    text-cyan-400    border-cyan-400/50',    stroke: '#22d3ee', fill: 'rgba(34,211,238,0.18)'  };
    if (pct >= 45) return { label: 'B',  bar: 'bg-cyan-500',     text: 'text-cyan-500',    badge: 'bg-cyan-500/15    text-cyan-500    border-cyan-500/50',    stroke: '#06b6d4', fill: 'rgba(6,182,212,0.18)'   };
    if (pct >= 32) return { label: 'C',  bar: 'bg-yellow-500',   text: 'text-yellow-500',  badge: 'bg-yellow-500/15  text-yellow-500  border-yellow-500/50',  stroke: '#eab308', fill: 'rgba(234,179,8,0.18)'   };
    if (pct >= 18) return { label: 'D',  bar: 'bg-orange-400',   text: 'text-orange-400',  badge: 'bg-orange-400/15  text-orange-400  border-orange-400/50',  stroke: '#fb923c', fill: 'rgba(251,146,60,0.18)'  };
    return           { label: 'F',  bar: 'bg-red-400',     text: 'text-red-400',    badge: 'bg-red-400/15    text-red-400    border-red-400/50',    stroke: '#f87171', fill: 'rgba(248,113,113,0.18)' };
}

// Round grade → color
function roundGradeStyle(round: string | undefined): { bg: string; text: string } {
    if (!round) return { bg: 'bg-muted/20', text: 'text-muted-foreground' };
    const r = round.toLowerCase();
    if (r.includes('top 10') || r.includes('round 1') || r.includes('1 (')) return { bg: 'bg-emerald-500/20', text: 'text-emerald-300' };
    if (r.includes('2 (') || r.includes('day 2') || r.includes('round 2')) return { bg: 'bg-cyan-500/20', text: 'text-cyan-300' };
    if (r.includes('3 (') || r.includes('round 3')) return { bg: 'bg-blue-500/20', text: 'text-blue-300' };
    if (r.includes('4 (') || r.includes('round 4')) return { bg: 'bg-yellow-500/20', text: 'text-yellow-300' };
    if (r.includes('5 (') || r.includes('round 5')) return { bg: 'bg-orange-500/20', text: 'text-orange-300' };
    if (r.includes('pfa') || r.includes('udfa') || r.includes('7 (')) return { bg: 'bg-red-500/20', text: 'text-red-300' };
    return { bg: 'bg-muted/20', text: 'text-muted-foreground' };
}

// Position-specific category groupings
const HB_GROUPS = [
    { label: 'Athleticism', tag: 'ATH', keys: ['Speed', 'Acceleration', 'Agility (COD)', 'Size', 'Deceleration'] },
    { label: 'Rushing',     tag: 'RSH', keys: ['Backfield Runs', 'Open Field', 'Contact Balance', 'Power', 'Cut', 'Vision', 'Patience', 'Creativity', 'Gap Scheme', 'Zone Scheme'] },
    { label: 'Receiving',   tag: 'REC', keys: ['Route Running', 'Catching'] },
    { label: 'Security',    tag: 'SEC', keys: ['Fumble Security', 'Pass Blocking'] },
    { label: 'Composites',  tag: '',    keys: ['Athleticism', 'Tackle Avoidance', 'Receiving', 'Miscellaneous'] },
];

const WR_GROUPS = [
    { label: 'Athleticism',    tag: 'ATH', keys: ['Speed', 'Acceleration', 'Agility (COD)', 'Quickness', 'Burst', 'Size/Strength'] },
    { label: 'Routes',         tag: 'RTE', keys: ['Footwork', 'Route Savvy', 'Route Efficiency', 'Stop Route', 'Double Move', 'Zone Recognition', 'Route Strength'] },
    { label: 'Catching',       tag: 'CTH', keys: ['Catch Hands', 'Catch Radius', 'Ball Tracking', 'Body Control', 'Jump Ball'] },
    { label: 'YAC & Toughness',tag: 'YAC', keys: ['Contact/RAC', 'Elusiveness', 'Power After Catch', 'Press Coverage', 'Fumble Security'] },
    { label: 'Composites',     tag: '',    keys: ['Athleticism', 'Press Coverage', 'Route Running', 'Catching', 'YAC', 'Miscellaneous'] },
];

const TE_GROUPS = [
    { label: 'Athleticism', tag: 'ATH', keys: ['Speed', 'Acceleration', 'Agility (COD)', 'Size/Strength'] },
    { label: 'Receiving',   tag: 'REC', keys: ['Route Running', 'Catching', 'Catch Hands', 'Catch Radius', 'Ball Tracking', 'Body Control', 'Press Handling'] },
    { label: 'YAC',         tag: 'YAC', keys: ['YAC', 'Contact/RAC', 'Elusiveness', 'Power After Catch', 'Jump Ball', 'Zone Recognition'] },
    { label: 'Blocking',    tag: 'BLK', keys: ['Blocking Composite', 'Pass Blocking', 'Move Blocking', 'LOS Blocking', 'Effort', 'Technique'] },
    { label: 'Composites',  tag: '',    keys: ['Athleticism', 'Route Running', 'Catching', 'YAC'] },
];

const QB_GROUPS = [
    { label: 'Accuracy',    tag: 'ACC', keys: ['Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Middle Accuracy', 'Sideline Accuracy', 'Off-Platform', 'Footwork'] },
    { label: 'Arm',         tag: 'ARM', keys: ['Arm Strength', 'Velocity', 'Release', 'Flexibility', 'Touch'] },
    { label: 'Mental',      tag: 'MNT', keys: ['Decision Making', 'Processing', 'Anticipation', 'Pressure Performance', 'Pre-Snap', 'Post-Snap', 'Eyes', 'Middle of Field'] },
    { label: 'Mobility',    tag: 'MOB', keys: ['Speed', 'Elusiveness', 'Power', 'Pocket Mobility', 'Pressure Mitigation', 'Extend Plays'] },
    { label: 'Composites',  tag: '',    keys: ['Accuracy Composite', 'Arm Composite', 'Mental Composite', 'Rushing Composite', 'Pocket Composite'] },
];

function getGroups(position: string) {
    const p = position.toUpperCase();
    if (p === 'QB') return QB_GROUPS;
    if (p === 'RB') return HB_GROUPS;
    if (p === 'TE') return TE_GROUPS;
    return WR_GROUPS;
}

// Build reverse map: skill key → { groupLabel, tag }
function buildSkillMap(groups: typeof WR_GROUPS): Map<string, { label: string; tag: string }> {
    const map = new Map<string, { label: string; tag: string }>();
    for (const g of groups) {
        if (g.tag === '') continue;
        for (const k of g.keys) {
            map.set(k, { label: g.label, tag: g.tag });
        }
    }
    return map;
}

function MetricBar({ label, value }: { label: string; value: number }) {
    const g = gradeOf(value);
    return (
        <div className="py-1.5">
            <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] text-muted-foreground/60 leading-none">{label}</span>
                <div className="flex items-center gap-1.5">
                    <span className={cn('text-xs font-black font-mono leading-none', g.text)}>
                        {Math.round(value)}
                    </span>
                    <span className={cn('text-[10px] font-black py-0.5 px-1.5 rounded border font-mono', g.badge)}>
                        {g.label}
                    </span>
                </div>
            </div>
            <div className="relative h-2 bg-border/20 rounded-full overflow-hidden">
                <div
                    className={cn('absolute left-0 top-0 h-full rounded-full transition-all duration-700', g.bar)}
                    style={{ width: `${Math.max(3, value)}%` }}
                />
                <div className="absolute top-0 h-full w-px bg-white/15" style={{ left: '50%' }} />
            </div>
        </div>
    );
}

// Tag chip colors by category
const TAG_COLORS: Record<string, string> = {
    ATH: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    RSH: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    RTE: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    CTH: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    YAC: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    SEC: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    REC: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    BLK: 'bg-stone-500/20 text-stone-300 border-stone-500/30',
    ACC: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    ARM: 'bg-red-500/20 text-red-300 border-red-500/30',
    MNT: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    MOB: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

// Radar accent colors per category tag
const TAG_RADAR: Record<string, { stroke: string; fill: string }> = {
    ATH: { stroke: 'rgb(192,132,252)', fill: 'rgba(192,132,252,0.15)' },
    RSH: { stroke: 'rgb(251,146,60)',  fill: 'rgba(251,146,60,0.15)'  },
    RTE: { stroke: 'rgb(96,165,250)',  fill: 'rgba(96,165,250,0.15)'  },
    CTH: { stroke: 'rgb(52,211,153)', fill: 'rgba(52,211,153,0.15)'  },
    YAC: { stroke: 'rgb(250,204,21)', fill: 'rgba(250,204,21,0.15)'  },
    SEC: { stroke: 'rgb(148,163,184)', fill: 'rgba(148,163,184,0.15)' },
    REC: { stroke: 'rgb(34,211,238)', fill: 'rgba(34,211,238,0.15)'  },
    BLK: { stroke: 'rgb(168,162,158)', fill: 'rgba(168,162,158,0.15)' },
    ACC: { stroke: 'rgb(56,189,248)', fill: 'rgba(56,189,248,0.15)'  },
    ARM: { stroke: 'rgb(248,113,113)', fill: 'rgba(248,113,113,0.15)' },
    MNT: { stroke: 'rgb(129,140,248)', fill: 'rgba(129,140,248,0.15)' },
    MOB: { stroke: 'rgb(45,212,191)', fill: 'rgba(45,212,191,0.15)'  },
    '':  { stroke: 'rgb(249,115,22)', fill: 'rgba(249,115,22,0.15)'  },
};

function SkillRow({ name, tag, value, isTop }: { name: string; tag: string; value: number; isTop: boolean }) {
    const g = gradeOf(value);
    const tagColor = TAG_COLORS[tag] ?? 'bg-muted/20 text-muted-foreground border-border/20';
    return (
        <div className="flex items-center gap-2 py-1">
            {tag && (
                <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 w-[34px] text-center', tagColor)}>
                    {tag}
                </span>
            )}
            <span className="text-[11px] text-muted-foreground/70 flex-1 min-w-0 truncate">{name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-16 h-1.5 rounded-full bg-border/20 overflow-hidden">
                    <div
                        className={cn('h-full rounded-full', isTop ? g.bar : 'bg-red-500/70')}
                        style={{ width: `${Math.max(3, value)}%` }}
                    />
                </div>
                <span className={cn('text-xs font-black font-mono w-6 text-right', isTop ? g.text : 'text-red-400')}>
                    {Math.round(value)}
                </span>
            </div>
        </div>
    );
}

// Short label for radar axes (max ~10 chars)
function shortKey(key: string): string {
    const MAP: Record<string, string> = {
        'Speed': 'Speed', 'Acceleration': 'Accel', 'Agility (COD)': 'Agility', 'Quickness': 'Quick',
        'Burst': 'Burst', 'Size/Strength': 'Size/Str', 'Footwork': 'Footwork',
        'Route Savvy': 'Savvy', 'Route Efficiency': 'Effic.', 'Stop Route': 'Stop Rte',
        'Double Move': 'Dbl Move', 'Zone Recognition': 'Zone Rec', 'Route Strength': 'Rte Str',
        'Catch Hands': 'Hands', 'Catch Radius': 'Radius', 'Ball Tracking': 'Tracking',
        'Body Control': 'Body Ctrl', 'Jump Ball': 'Jump Ball',
        'Contact/RAC': 'RAC', 'Elusiveness': 'Elusiv.', 'Power After Catch': 'PAC',
        'Press Coverage': 'Press', 'Fumble Security': 'Fmbl Sec',
        'Athleticism': 'ATH', 'Route Running': 'Routes', 'Catching': 'Catch',
        'YAC': 'YAC', 'Miscellaneous': 'Misc',
        'Backfield Runs': 'BF Runs', 'Open Field': 'Open Fld', 'Contact Balance': 'Bal.',
        'Power': 'Power', 'Cut': 'Cut', 'Vision': 'Vision', 'Patience': 'Patience',
        'Creativity': 'Creat.', 'Gap Scheme': 'Gap', 'Zone Scheme': 'Zone',
        'Tackle Avoidance': 'Tackle Av.', 'Receiving': 'Recv', 'Pass Blocking': 'Pass Blk',
        'Press Handling': 'Press Hdl', 'LOS Blocking': 'LOS Blk', 'Move Blocking': 'Move Blk',
        'Blocking Composite': 'Blk Comp', 'Effort': 'Effort', 'Technique': 'Tech.',
        'Short Accuracy': 'Short', 'Medium Accuracy': 'Medium', 'Deep Accuracy': 'Deep',
        'Middle Accuracy': 'Middle', 'Sideline Accuracy': 'Sideline', 'Off-Platform': 'Off-Plat',
        'Arm Strength': 'Strength', 'Velocity': 'Veloc.', 'Release': 'Release',
        'Flexibility': 'Flex.', 'Touch': 'Touch',
        'Decision Making': 'Decision', 'Processing': 'Process', 'Anticipation': 'Anticip.',
        'Pressure Performance': 'Press Perf', 'Pre-Snap': 'Pre-Snap', 'Post-Snap': 'Post-Snap',
        'Eyes': 'Eyes', 'Middle of Field': 'MOF',
        'Pocket Mobility': 'Pkt Mob', 'Pressure Mitigation': 'Prs Mit', 'Extend Plays': 'Ext Plays',
        'Accuracy Composite': 'ACC', 'Arm Composite': 'ARM', 'Mental Composite': 'MNT',
        'Rushing Composite': 'RSH', 'Pocket Composite': 'PKT',
        'Size': 'Size', 'Deceleration': 'Decel.',
    };
    return MAP[key] ?? key.slice(0, 10);
}

// Custom angle-aware tick for radar charts
function RadarTick({ payload, x, y, cx, cy }: any) {
    let anchor: 'middle' | 'end' | 'start' = 'middle';
    if (x < cx - 10) anchor = 'end';
    else if (x > cx + 10) anchor = 'start';
    return (
        <text
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.40)"
            fontSize={8.5}
            fontWeight={700}
            fontFamily="inherit"
        >
            {payload.value}
        </text>
    );
}

function GroupRadar({ group, filmGrades }: { group: typeof WR_GROUPS[0]; filmGrades: Record<string, number> }) {
    const rows = group.keys
        .map(k => ({ subject: shortKey(k), pct: filmGrades[k] ?? 0 }))
        .filter(r => r.pct > 0);

    if (rows.length < 3) return null;

    const accent = TAG_RADAR[group.tag] ?? TAG_RADAR[''];

    return (
        <div className="rounded-xl bg-muted/5 border border-border/15 px-3 py-3">
            <div className="flex items-center gap-2 mb-1">
                {group.tag && (
                    <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border', TAG_COLORS[group.tag])}>
                        {group.tag}
                    </span>
                )}
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                    {group.label}
                </span>
            </div>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={rows} margin={{ top: 12, right: 28, bottom: 12, left: 28 }}>
                        <PolarGrid stroke="rgba(255,255,255,0.07)" gridType="polygon" />
                        <PolarAngleAxis dataKey="subject" tick={<RadarTick />} />
                        <Radar
                            dataKey="pct"
                            stroke={accent.stroke}
                            fill={accent.fill}
                            strokeWidth={1.5}
                            dot={{ fill: accent.stroke, r: 2.5, strokeWidth: 0 }}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// Jitter strip: one horizontal track per group, dots at metric values
function JitterView({ groups, filmGrades }: { groups: typeof WR_GROUPS; filmGrades: Record<string, number> }) {
    return (
        <div className="space-y-4">
            {groups.map(group => {
                const points = group.keys
                    .map(k => ({ label: k, value: filmGrades[k] ?? 0, shortLabel: shortKey(k) }))
                    .filter(p => p.value > 0);
                if (points.length === 0) return null;
                const accent = TAG_RADAR[group.tag] ?? TAG_RADAR[''];
                return (
                    <div key={group.label}>
                        <div className="flex items-center gap-2 mb-2">
                            {group.tag && (
                                <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border', TAG_COLORS[group.tag])}>
                                    {group.tag}
                                </span>
                            )}
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                                {group.label}
                            </span>
                        </div>
                        {/* Track */}
                        <div className="relative h-10 rounded-lg bg-border/10 border border-border/15">
                            {/* Grid lines at 25/50/75 */}
                            {[25, 50, 75].map(t => (
                                <div key={t} className="absolute top-0 h-full w-px bg-white/[0.07]" style={{ left: `${t}%` }} />
                            ))}
                            {/* Dots */}
                            {points.map(p => {
                                const g = gradeOf(p.value);
                                return (
                                    <div
                                        key={p.label}
                                        title={`${p.label}: ${Math.round(p.value)}`}
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group cursor-default"
                                        style={{ left: `${Math.max(2, Math.min(98, p.value))}%` }}
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full border border-background/50 transition-transform group-hover:scale-150"
                                            style={{ backgroundColor: accent.stroke }}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                                            <div className="bg-popover border border-border/40 rounded px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap shadow-lg">
                                                <span className={g.text}>{Math.round(p.value)}</span>
                                                <span className="text-muted-foreground/60 ml-1">{p.label}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between mt-0.5 px-0.5">
                            <span className="text-[8px] text-muted-foreground/25">POOR</span>
                            <span className="text-[8px] text-muted-foreground/25">AVG</span>
                            <span className="text-[8px] text-muted-foreground/25">ELITE</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function FilmGradesCard({ jfoster, position }: Props) {
    const filmGrades: Record<string, number> = jfoster.film_grades
        ? JSON.parse(jfoster.film_grades)
        : {};

    const hasFilmGrades = Object.keys(filmGrades).length > 0;
    const roundStyle = roundGradeStyle(jfoster.round_grade);
    const groups = getGroups(position);
    const skillMap = buildSkillMap(groups);

    const [view, setView] = useState<'bar' | 'radar' | 'jitter'>('bar');

    // Parse strengths/weaknesses (stored as JSON array or plain text)
    function parseList(raw?: string): string[] {
        if (!raw) return [];
        try { return JSON.parse(raw) as string[]; } catch { return [raw]; }
    }
    const strengths = parseList(jfoster.strengths);
    const weaknesses = parseList(jfoster.weaknesses);

    // Composite keys to exclude from Skills at a Glance
    const compositeKeys = new Set(
        groups.find(g => g.tag === '')?.keys ?? []
    );

    // Individual skills sorted for top/bottom
    const individualSkills = Object.entries(filmGrades)
        .filter(([k]) => !compositeKeys.has(k))
        .map(([k, v]) => ({ name: k, value: v, ...skillMap.get(k) ?? { label: '', tag: '' } }))
        .sort((a, b) => b.value - a.value);

    const top5 = individualSkills.slice(0, 5);
    const bottom5 = [...individualSkills].sort((a, b) => a.value - b.value).slice(0, 5);

    return (
        <div className="space-y-4">
            {/* Overall assessment row */}
            <div className="flex flex-wrap gap-2 items-center">
                {jfoster.overall_grade != null && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-border/10 border border-border/20">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                            Grade
                        </span>
                        <span className="text-xl font-black font-mono text-foreground">
                            {jfoster.overall_grade.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40">/10</span>
                    </div>
                )}
                {jfoster.round_grade && (
                    <div className={cn(
                        'px-3 py-2 rounded-lg text-sm font-bold border border-transparent',
                        roundStyle.bg, roundStyle.text
                    )}>
                        {jfoster.round_grade}
                    </div>
                )}
                {jfoster.nfl_comp && (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-border/10 border border-border/20">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                            NFL Comp
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                            {jfoster.nfl_comp}
                        </span>
                    </div>
                )}
                {jfoster.pos_fit && (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-border/10 border border-border/20">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                            Align
                        </span>
                        <span className="text-sm font-black font-mono text-foreground">
                            {jfoster.pos_fit}
                        </span>
                    </div>
                )}
            </div>

            {/* Skills at a Glance (bar view only) */}
            {view === 'bar' && individualSkills.length >= 5 && (
                <div className="rounded-xl bg-muted/5 border border-border/15 overflow-hidden">
                    <div className="px-4 py-2 border-b border-border/10 bg-white/[0.02]">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                            Skills at a Glance
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/10">
                        <div className="px-4 py-3">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/60 mb-2">
                                Top 5
                            </div>
                            <div className="space-y-0.5">
                                {top5.map(s => (
                                    <SkillRow key={s.name} name={s.name} tag={s.tag} value={s.value} isTop={true} />
                                ))}
                            </div>
                        </div>
                        <div className="px-4 py-3">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-red-500/60 mb-2">
                                Bottom 5
                            </div>
                            <div className="space-y-0.5">
                                {bottom5.map(s => (
                                    <SkillRow key={s.name} name={s.name} tag={s.tag} value={s.value} isTop={false} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Film grade groups — BAR/RADAR/JITTER toggle */}
            {hasFilmGrades && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                            Film Grades by Category
                        </span>
                        <div className="flex items-center bg-white/[0.04] rounded-md border border-border/20 overflow-hidden">
                            {(['bar', 'radar', 'jitter'] as const).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 transition-colors ${
                                        view === v
                                            ? 'bg-primary/20 text-primary'
                                            : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {view === 'radar' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groups.map(group => (
                                <GroupRadar key={group.label} group={group} filmGrades={filmGrades} />
                            ))}
                        </div>
                    ) : view === 'jitter' ? (
                        <JitterView groups={groups} filmGrades={filmGrades} />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groups.map(group => {
                                const rows = group.keys
                                    .map(k => ({ label: k, value: filmGrades[k] }))
                                    .filter(r => r.value != null && r.value > 0);
                                if (rows.length === 0) return null;
                                return (
                                    <div key={group.label} className="rounded-xl bg-muted/5 border border-border/15 px-4 py-3">
                                        <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                                            {group.label}
                                        </div>
                                        {rows.map(r => (
                                            <MetricBar key={r.label} label={r.label} value={r.value} />
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Strengths & Weaknesses */}
            {(strengths.length > 0 || weaknesses.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {strengths.length > 0 && (
                        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 mb-2.5">
                                + Strengths
                            </div>
                            <ul className="space-y-1.5">
                                {strengths.map((s, i) => (
                                    <li key={i} className="flex gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                                        <span className="text-emerald-500/50 shrink-0 mt-0.5">•</span>
                                        <span>{s}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {weaknesses.length > 0 && (
                        <div className="rounded-xl bg-red-500/5 border border-red-500/15 px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-widest text-red-500/60 mb-2.5">
                                − Weaknesses
                            </div>
                            <ul className="space-y-1.5">
                                {weaknesses.map((w, i) => (
                                    <li key={i} className="flex gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                                        <span className="text-red-500/50 shrink-0 mt-0.5">•</span>
                                        <span>{w}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Athletic composites from J. Foster */}
            {(jfoster.speed_score_jf || jfoster.acceleration_score || jfoster.size_score || jfoster.agility_score_jf || jfoster.athletic_score) && (
                <div className="rounded-xl bg-muted/5 border border-border/15 px-4 py-3">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                        Athletic Composite Scores
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4">
                        {jfoster.speed_score_jf != null && (
                            <MetricBar label="Speed" value={jfoster.speed_score_jf} />
                        )}
                        {jfoster.acceleration_score != null && (
                            <MetricBar label="Acceleration" value={jfoster.acceleration_score} />
                        )}
                        {jfoster.agility_score_jf != null && (
                            <MetricBar label="Agility" value={jfoster.agility_score_jf} />
                        )}
                        {jfoster.size_score != null && (
                            <MetricBar label="Size" value={jfoster.size_score} />
                        )}
                        {jfoster.athletic_score != null && (
                            <MetricBar label="Overall" value={jfoster.athletic_score} />
                        )}
                    </div>
                </div>
            )}

            {/* Last updated */}
            {jfoster.updated_at && (
                <div className="text-[9px] text-muted-foreground/25 text-right">
                    JFoster report last updated {new Date(jfoster.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
            )}
        </div>
    );
}
