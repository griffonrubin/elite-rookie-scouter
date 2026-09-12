'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AppHeaderProps {
  children?: React.ReactNode;
}

/**
 * Three sections, because the app answers three different questions.
 *
 * The old header offered Rookie or Redraft, which described which player
 * pool you were looking at rather than what you were trying to do. Start/Sit
 * sat at the end of the Redraft row beside Mock and Dropoff — draft-prep
 * tools you use once in August, next to the one page you open every week in
 * September.
 *
 * Dynasty is the incoming class and the prospects behind it. Draft is
 * everything you do before the season starts. In Season is the week-to-week
 * work, and it is the section still being built out — which is why the
 * pages that do not exist yet are listed rather than hidden. A section that
 * shows one tab reads like a dead end; one that shows what is coming reads
 * like a plan.
 *
 * Adding a feature means adding a line to `nav` below and nothing else.
 */
interface NavItem {
  href: string;
  label: string;
  /** Listed but not built yet: shown greyed, with a tag, and not a link. */
  soon?: boolean;
}

interface Section {
  key: string;
  label: string;
  /** What this section is, under the wordmark. */
  tagline: string;
  accent: string;
  glow: string;
  /** Where the section tab points. */
  root: string;
  /**
   * Paths that belong to this section, longest first. In Season lives under
   * /redraft/ for now, so it has to be tested before Draft claims the prefix.
   */
  owns: string[];
  nav: readonly NavItem[];
}

const SECTIONS: readonly Section[] = [
  {
    key: 'dynasty',
    label: 'Dynasty',
    tagline: '2026 Draft Class',
    accent: 'var(--primary)',
    glow: 'rgba(249,115,22,0.4)',
    root: '/',
    owns: ['/horizontal', '/compare', '/tier-builder', '/rankings', '/players', '/teams'],
    nav: [
      { href: '/',             label: 'Board'    },
      { href: '/horizontal',   label: 'By Round' },
      { href: '/compare',      label: 'Compare'  },
      { href: '/tier-builder', label: 'Tiers'    },
    ],
  },
  {
    key: 'draft',
    label: 'Draft',
    tagline: '2026 Season · PPR',
    accent: '#38bdf8',
    glow: 'rgba(56,189,248,0.4)',
    root: '/redraft',
    owns: ['/redraft'],
    nav: [
      { href: '/redraft',         label: 'Board'   },
      { href: '/redraft/mock',    label: 'Mock'    },
      { href: '/redraft/compare', label: 'Compare' },
      { href: '/redraft/tiers',   label: 'Tiers'   },
      { href: '/redraft/dropoff', label: 'Dropoff' },
    ],
  },
  {
    key: 'season',
    label: 'In Season',
    tagline: 'Week to week',
    accent: '#34d399',
    glow: 'rgba(52,211,153,0.4)',
    root: '/redraft/start-sit',
    owns: ['/redraft/start-sit', '/settings/leagues'],
    nav: [
      { href: '/redraft/start-sit', label: 'Start/Sit' },
      { href: '/in-season/waivers', label: 'Waiver Wire',    soon: true },
      { href: '/in-season/power',   label: 'Power Rankings', soon: true },
      { href: '/in-season/team',    label: 'Team Analysis',  soon: true },
      { href: '/in-season/trades',  label: 'Trade Analyzer', soon: true },
      // Not a fantasy tool at all, but the same data answers it: the spread,
      // the total and the de-vigged moneyline are already loaded for every
      // game of every week.
      { href: '/in-season/pickems',  label: "Pick'ems", soon: true },
    ],
  },
];

/** Hrefs that are section roots — these need an exact match to be "active". */
const INDEX_HREFS = new Set<string>(['/', '/redraft']);

/**
 * Which section a path belongs to.
 *
 * Longest prefix wins, so /redraft/start-sit reaches In Season rather than
 * being swallowed by Draft's /redraft. Dynasty is the fallback because it
 * owns the bare root.
 */
export function sectionFor(pathname: string): Section {
  let best: Section | null = null;
  let bestLen = -1;
  for (const s of SECTIONS) {
    for (const p of s.owns) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > bestLen) {
        best = s;
        bestLen = p.length;
      }
    }
  }
  return best ?? SECTIONS[0];
}

export function AppHeader({ children }: AppHeaderProps) {
  const pathname = usePathname();
  const section = sectionFor(pathname);

  // On phones both rows scroll sideways; keep the tab you are on in view so
  // arriving at /redraft/dropoff never shows a nav with Dropoff offscreen.
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeLinkRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06]"
      style={{
        background: 'linear-gradient(180deg, rgba(12,21,32,0.92) 0%, rgba(6,10,16,0.88) 100%)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      }}
    >
      {/* Gradient accent line at very top — tints to match the active section */}
      <div className="h-[2px] w-full" style={{
        background: `linear-gradient(90deg, transparent 5%, ${section.accent} 30%,`
          + ` ${section.accent} 70%, transparent 95%)`,
        opacity: 0.6,
      }} />

      {/* Row one: who you are and which section you are in. */}
      <div className="px-3 sm:px-6 lg:px-10 h-[52px] flex items-center gap-3 sm:gap-4">
        {/* The glow colour follows the section, so it rides a custom property
            rather than three hardcoded hover classes. */}
        <Link href={section.root} className="flex items-center gap-1.5 shrink-0 group"
          style={{ '--glow': section.glow } as React.CSSProperties}>
          <svg
            className="w-6 h-6 transition-[filter] duration-200
                       group-hover:drop-shadow-[0_0_8px_var(--glow)]"
            viewBox="0 0 24 24"
            fill={section.accent}
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
          </svg>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-bold text-foreground tracking-tight leading-tight">
              DyCharts
            </span>
            <span className="text-[10px] font-semibold tracking-wide uppercase leading-none"
              style={{ color: section.accent, opacity: 0.75 }}>
              {section.tagline}
            </span>
          </div>
        </Link>

        <div
          className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10
                     shrink-0 ml-1 overflow-x-auto [scrollbar-width:none]
                     [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Section"
        >
          {SECTIONS.map(s => {
            const on = s.key === section.key;
            return (
              <Link
                key={s.key}
                href={s.root}
                role="tab"
                aria-selected={on}
                className={`px-2 sm:px-3.5 py-1.5 rounded-md text-[11px] sm:text-[12px] font-bold
                            tracking-tight transition-all duration-200 whitespace-nowrap
                            focus-visible:outline-none focus-visible:ring-2 ${
                  on ? 'text-white' : 'text-muted-foreground hover:text-foreground/80'
                }`}
                style={on
                  ? { background: s.accent, boxShadow: `0 0 12px ${s.glow}` }
                  : undefined}
              >
                {s.label}
              </Link>
            );
          })}
        </div>

        {/* Children slot (breadcrumbs, player nav, etc.) */}
        {children && (
          <div className="hidden sm:flex items-center gap-3 ml-auto text-[12px] min-w-0">
            {children}
          </div>
        )}
      </div>

      {/* Row two: the pages inside this section. Its own row rather than
          sharing with the section tabs — five items plus three tabs plus a
          wordmark did not fit a phone, and the two are different kinds of
          choice anyway. */}
      <nav className="px-3 sm:px-6 lg:px-10 h-[38px] flex items-stretch gap-0.5
                      border-t border-white/[0.04] overflow-x-auto
                      [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`${section.label} pages`}>
        {section.nav.map(({ href, label, soon }) => {
          if (soon) {
            return (
              <span key={href}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 text-[13px] font-semibold
                           whitespace-nowrap text-muted-foreground/35 cursor-default"
                title={`${label} — not built yet`}>
                {label}
                <span className="px-1 py-px rounded text-[8px] font-bold uppercase
                                 tracking-wider bg-white/[0.06] text-muted-foreground/50">
                  Soon
                </span>
              </span>
            );
          }
          const isActive = INDEX_HREFS.has(href)
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              ref={isActive ? activeLinkRef : undefined}
              className={`relative flex items-center px-2.5 sm:px-3.5 text-[13px] font-semibold
                          whitespace-nowrap transition-all duration-200
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:rounded-sm ${
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              {label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{
                    background: section.accent,
                    boxShadow: `0 0 8px ${section.glow}`,
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
