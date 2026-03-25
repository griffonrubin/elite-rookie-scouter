'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AppHeaderProps {
  children?: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/',             label: 'Board'   },
  { href: '/compare',     label: 'Compare' },
  { href: '/tier-builder', label: 'Tiers'   },
] as const;

export function AppHeader({ children }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06]"
      style={{
        background: 'linear-gradient(180deg, rgba(12,21,32,0.92) 0%, rgba(6,10,16,0.88) 100%)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      }}
    >
      {/* Gradient accent line at very top */}
      <div className="h-[2px] w-full" style={{
        background: 'linear-gradient(90deg, transparent 5%, var(--primary) 30%, #fb923c 50%, var(--primary) 70%, transparent 95%)',
        opacity: 0.6,
      }} />

      <div className="px-3 sm:px-6 lg:px-10 h-[52px] flex items-center gap-3 sm:gap-5 overflow-hidden">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 shrink-0 group">
          <svg className="w-6 h-6 transition-[filter] duration-200 group-hover:drop-shadow-[0_0_8px_rgba(249,115,22,0.65)]" viewBox="0 0 24 24" fill="#f97316"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10" /></svg>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-bold text-foreground tracking-tight leading-tight">
              DyCharts
            </span>
            <span className="text-[10px] font-semibold text-primary/70 tracking-wide uppercase leading-none">
              2026 Draft Class
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="flex items-stretch h-full gap-0.5 ml-2">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = href === '/'
              ? pathname === '/'
              : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center px-4 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:rounded-sm ${
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
                      background: 'var(--primary)',
                      boxShadow: '0 0 8px rgba(249, 115, 22, 0.4)',
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
