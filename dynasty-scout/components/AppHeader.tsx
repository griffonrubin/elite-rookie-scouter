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
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/40">
      <div className="px-6 sm:px-10 h-14 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-xs font-black">ERS</span>
          </div>
          <span className="text-sm font-bold text-foreground hidden sm:block tracking-tight">
            Elite Rookie Scouter
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-stretch h-full gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = href === '/'
              ? pathname === '/'
              : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center px-3 text-sm font-semibold transition-colors border-b-2 ${
                  isActive
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Children slot (breadcrumbs, player nav, etc.) */}
        {children && (
          <div className="flex items-center gap-3 ml-auto">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
