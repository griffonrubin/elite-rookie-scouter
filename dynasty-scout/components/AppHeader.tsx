'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AppHeaderProps {
  children?: React.ReactNode;
}

const ROOKIE_NAV = [
  { href: '/',             label: 'Board'    },
  { href: '/horizontal',   label: 'By Round' },
  { href: '/compare',      label: 'Compare'  },
  { href: '/tier-builder', label: 'Tiers'    },
] as const;

const REDRAFT_NAV = [
  { href: '/redraft',         label: 'Board'   },
  { href: '/redraft/mock',    label: 'Mock'    },
  { href: '/redraft/compare', label: 'Compare' },
  { href: '/redraft/tiers',   label: 'Tiers'   },
] as const;

/** Hrefs that are section roots — these need an exact match to be "active". */
const INDEX_HREFS = new Set<string>(['/', '/redraft']);

export function AppHeader({ children }: AppHeaderProps) {
  const pathname = usePathname();
  const isRedraft = pathname.startsWith('/redraft');

  const navLinks = isRedraft ? REDRAFT_NAV : ROOKIE_NAV;

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06]"
      style={{
        background: 'linear-gradient(180deg, rgba(12,21,32,0.92) 0%, rgba(6,10,16,0.88) 100%)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      }}
    >
      {/* Gradient accent line at very top — tints to match the active mode */}
      <div className="h-[2px] w-full" style={{
        background: isRedraft
          ? 'linear-gradient(90deg, transparent 5%, #38bdf8 30%, #22d3ee 50%, #38bdf8 70%, transparent 95%)'
          : 'linear-gradient(90deg, transparent 5%, var(--primary) 30%, #fb923c 50%, var(--primary) 70%, transparent 95%)',
        opacity: 0.6,
      }} />

      <div className="px-3 sm:px-6 lg:px-10 h-[52px] flex items-center gap-3 sm:gap-4 overflow-hidden">
        {/* Logo */}
        <Link href={isRedraft ? '/redraft' : '/'} className="flex items-center gap-1.5 shrink-0 group">
          <svg
            className={`w-6 h-6 transition-[filter] duration-200 ${
              isRedraft
                ? 'group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.65)]'
                : 'group-hover:drop-shadow-[0_0_8px_rgba(249,115,22,0.65)]'
            }`}
            viewBox="0 0 24 24"
            fill={isRedraft ? '#38bdf8' : '#f97316'}
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
          </svg>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-bold text-foreground tracking-tight leading-tight">
              DyCharts
            </span>
            <span className={`text-[10px] font-semibold tracking-wide uppercase leading-none ${
              isRedraft ? 'text-sky-400/70' : 'text-primary/70'
            }`}>
              {isRedraft ? '2026 Season · PPR' : '2026 Draft Class'}
            </span>
          </div>
        </Link>

        {/* Mode toggle — Rookie ↔ Redraft */}
        <div
          className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 shrink-0 ml-1"
          role="tablist"
          aria-label="Site mode"
        >
          <Link
            href="/"
            role="tab"
            aria-selected={!isRedraft}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-md text-[11px] sm:text-[12px] font-bold tracking-tight transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              !isRedraft
                ? 'bg-primary text-white shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            Rookie
          </Link>
          <Link
            href="/redraft"
            role="tab"
            aria-selected={isRedraft}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-md text-[11px] sm:text-[12px] font-bold tracking-tight transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
              isRedraft
                ? 'bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            Redraft
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex items-stretch h-full gap-0.5">
          {navLinks.map(({ href, label }) => {
            const isActive = INDEX_HREFS.has(href)
              ? pathname === href
              : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center px-3 sm:px-4 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:rounded-sm ${
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80'
                }`}
              >
                {label}
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{
                      background: isRedraft ? '#38bdf8' : 'var(--primary)',
                      boxShadow: isRedraft
                        ? '0 0 8px rgba(56, 189, 248, 0.4)'
                        : '0 0 8px rgba(249, 115, 22, 0.4)',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Children slot (breadcrumbs, player nav, etc.) */}
        {children && (
          <div className="hidden sm:flex items-center gap-3 ml-auto text-[12px] min-w-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
