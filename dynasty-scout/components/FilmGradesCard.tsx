'use client';

import { JFosterGrades } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
    jfoster: JFosterGrades;
    position: string;
}

// Grade color scale: same as AthleticsCard's gradeOf()
function gradeOf(pct: number) {
    if (pct >= 90) return { label: 'S+', bar: 'bg-yellow-400',   text: 'text-yellow-400',  badge: 'bg-yellow-400/15  text-yellow-400  border-yellow-400/50'  };
    if (pct >= 80) return { label: 'S',  bar: 'bg-yellow-300',   text: 'text-yellow-300',  badge: 'bg-yellow-300/15  text-yellow-300  border-yellow-300/50'  };
    if (pct >= 70) return { label: 'A',  bar: 'bg-emerald-400',  text: 'text-emerald-400', badge: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/50' };
    if (pct >= 58) return { label: 'B+', bar: 'bg-cyan-400',     text: 'text-cyan-400',    badge: 'bg-cyan-400/15    text-cyan-400    border-cyan-400/50'    };
    if (pct >= 45) return { label: 'B',  bar: 'bg-cyan-500',     text: 'text-cyan-500',    badge: 'bg-cyan-500/15    text-cyan-500    border-cyan-500/50'    };
    if (pct >= 32) return { label: 'C',  bar: 'bg-yellow-500',   text: 'text-yellow-500',  badge: 'bg-yellow-500/15  text-yellow-500  border-yellow-500/50'  };
    if (pct >= 18) return { label: 'D',  bar: 'bg-orange-400',   text: 'text-orange-400',  badge: 'bg-orange-400/15  text-orange-400  border-orange-400/50'  };
    return           { label: 'F',  bar: 'bg-red-400',     text: 'text-red-400',    badge: 'bg-red-400/15    text-red-400    border-red-400/50'    };
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

// Position-specific category groupings for display
const HB_GROUPS = [
    { label: 'Athleticism',      keys: ['Speed', 'Acceleration', 'Agility (COD)', 'Size', 'Deceleration'] },
    { label: 'Rushing',          keys: ['Backfield Runs', 'Open Field', 'Contact Balance', 'Power', 'Cut', 'Vision', 'Patience', 'Creativity', 'Gap Scheme', 'Zone Scheme'] },
    { label: 'Receiving',        keys: ['Route Running', 'Catching'] },
    { label: 'Ball Security',    keys: ['Fumble Security', 'Pass Blocking'] },
    { label: 'Composites',       keys: ['Athleticism', 'Tackle Avoidance', 'Receiving', 'Miscellaneous'] },
];

const WR_GROUPS = [
    { label: 'Athleticism',      keys: ['Speed', 'Acceleration', 'Agility (COD)', 'Quickness', 'Burst', 'Size/Strength'] },
    { label: 'Routes',           keys: ['Footwork', 'Route Savvy', 'Route Efficiency', 'Stop Route', 'Double Move', 'Zone Recognition'] },
    { label: 'Catching',         keys: ['Catch Hands', 'Catch Radius', 'Ball Tracking', 'Body Control', 'Jump Ball'] },
    { label: 'YAC & Toughness',  keys: ['Contact/RAC', 'Elusiveness', 'Power After Catch', 'Press Coverage', 'Fumble Security'] },
    { label: 'Composites',       keys: ['Athleticism', 'Press Coverage', 'Route Running', 'Catching', 'YAC', 'Miscellaneous'] },
];

const TE_GROUPS = [
    { label: 'Athleticism',      keys: ['Speed', 'Acceleration', 'Agility (COD)', 'Size/Strength'] },
    { label: 'Receiving',        keys: ['Route Running', 'Catching', 'Catch Hands', 'Catch Radius', 'Ball Tracking', 'Body Control', 'Press Handling'] },
    { label: 'YAC & Toughness',  keys: ['YAC', 'Contact/RAC', 'Elusiveness', 'Power After Catch', 'Jump Ball', 'Zone Recognition'] },
    { label: 'Blocking',         keys: ['Blocking Composite', 'Pass Blocking', 'Move Blocking', 'LOS Blocking', 'Effort', 'Technique'] },
    { label: 'Composites',       keys: ['Athleticism', 'Route Running', 'Catching', 'YAC'] },
];

const QB_GROUPS = [
    { label: 'Accuracy',         keys: ['Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Middle Accuracy', 'Sideline Accuracy', 'Off-Platform', 'Footwork'] },
    { label: 'Arm',              keys: ['Arm Strength', 'Velocity', 'Release', 'Flexibility', 'Touch'] },
    { label: 'Mental Game',      keys: ['Decision Making', 'Processing', 'Anticipation', 'Pressure Performance', 'Pre-Snap', 'Post-Snap', 'Eyes', 'Middle of Field'] },
    { label: 'Mobility',         keys: ['Speed', 'Elusiveness', 'Power', 'Pocket Mobility', 'Pressure Mitigation', 'Extend Plays'] },
    { label: 'Composites',       keys: ['Accuracy Composite', 'Arm Composite', 'Mental Composite', 'Rushing Composite', 'Pocket Composite'] },
];

function getGroups(position: string) {
    const p = position.toUpperCase();
    if (p === 'QB') return QB_GROUPS;
    if (p === 'RB') return HB_GROUPS;
    if (p === 'TE') return TE_GROUPS;
    return WR_GROUPS;
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

export function FilmGradesCard({ jfoster, position }: Props) {
    const filmGrades: Record<string, number> = jfoster.film_grades
        ? JSON.parse(jfoster.film_grades)
        : {};

    const hasFilmGrades = Object.keys(filmGrades).length > 0;
    const roundStyle = roundGradeStyle(jfoster.round_grade);
    const groups = getGroups(position);

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
            </div>

            {/* Film grade groups */}
            {hasFilmGrades && (
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

            {/* Athletic composites from J. Foster (if available) */}
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
        </div>
    );
}
