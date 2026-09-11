/**
 * Chart colours, validated rather than chosen by eye.
 *
 * Every value here passed the six checks against this app's dark chart
 * surface (#0c1520): lightness band, chroma floor, colour-blind separation,
 * normal-vision separation, and contrast. Re-run before changing any of them:
 *
 *   node scripts/validate_palette.js "#0284C7,#EA580C" --mode dark --surface "#0c1520"
 *
 * Two things are worth knowing before reaching for something else.
 *
 * The position colours in lib/constants are a different job — they say what
 * a player IS. These say which of two things a mark belongs to, so a pair of
 * running backs compared head to head stay distinguishable.
 *
 * And the obvious pick for gain-and-loss, emerald against rose, fails: ΔE 5.6
 * under deuteranopia, well below the floor. Green-up red-down is the default
 * in every finance dashboard and it is unreadable for a tenth of men. Blue
 * against red separates cleanly for every kind of colour vision.
 */

/** Identity: which of two compared entities a mark belongs to. */
export const SERIES = {
    a: '#0284C7',
    b: '#EA580C',
} as const;

/** Polarity: a signed change around zero. Always shipped with a signed label. */
export const DIVERGING = {
    positive: '#2563EB',
    negative: '#DC2626',
    /** Neutral midpoint — a diverging scale never puts a hue at zero. */
    zero: '#64748B',
} as const;

/** Recessive furniture. Grid and axes must never compete with the data. */
export const CHART_INK = {
    grid: 'rgba(255,255,255,0.06)',
    axis: 'rgba(255,255,255,0.14)',
    /** Ring drawn around overlapping marks so they stay countable. */
    surface: '#0c1520',
    /**
     * The opponent's lineup: context, not a third series.
     *
     * Deliberately gray. It fails the categorical lightness and chroma checks
     * — which is the point, and why it must not be "fixed" into a hue: a third
     * colour would say the opponent's players are a third option you might
     * pick, and they are not. It clears contrast against the surface at over
     * 3:1, which is the bar that applies to a non-categorical mark.
     */
    context: '#94A3B8',
} as const;

/** Mark geometry, from the shared spec: thin marks, rounded data ends. */
export const MARK = {
    barRadius: 4,
    lineWidth: 2,
    dotRadius: 4.5,
    /** Gap between adjacent fills, in the surface colour. */
    gap: 2,
} as const;
