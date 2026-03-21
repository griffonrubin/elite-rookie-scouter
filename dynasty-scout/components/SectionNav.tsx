'use client';

import { useEffect, useState } from 'react';

interface Section {
    id: string;
    label: string;
}

const SECTIONS: Section[] = [
    { id: 'overview',  label: 'Overview'  },
    { id: 'scout',     label: 'Scout'     },
    { id: 'athletics', label: 'Athletics' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'stats',     label: 'Stats'     },
    { id: 'rankings',  label: 'Rankings'  },
    { id: 'news',      label: 'News'      },
];

export function SectionNav() {
    const [active, setActive] = useState<string>('overview');

    useEffect(() => {
        // Only observe sections that actually exist in the DOM
        const existing = SECTIONS.filter(s => document.getElementById(s.id));
        if (existing.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                // Pick the topmost section that is intersecting
                const intersecting = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (intersecting.length > 0) {
                    setActive(intersecting[0].target.id);
                }
            },
            { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
        );

        existing.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    // Filter to only show sections that exist in the DOM (client-only)
    const [visible, setVisible] = useState<Section[]>(SECTIONS);
    useEffect(() => {
        setVisible(SECTIONS.filter(s => document.getElementById(s.id)));
    }, []);

    if (visible.length === 0) return null;

    return (
        <nav
            className="hidden xl:flex fixed left-6 top-1/2 -translate-y-1/2 z-40 flex-col gap-1.5"
            aria-label="Page sections"
        >
            {visible.map((section) => {
                const isActive = active === section.id;
                return (
                    <a
                        key={section.id}
                        href={`#${section.id}`}
                        onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className={`
                            group flex items-center gap-2 transition-all duration-200
                            ${isActive ? 'opacity-100' : 'opacity-40 hover:opacity-75'}
                        `}
                    >
                        {/* Dot indicator */}
                        <span
                            className={`
                                block rounded-full transition-all duration-200 flex-shrink-0
                                ${isActive
                                    ? 'w-2 h-2 bg-primary'
                                    : 'w-1.5 h-1.5 bg-muted-foreground/60 group-hover:bg-muted-foreground'
                                }
                            `}
                        />
                        {/* Label — only visible when active or hovered */}
                        <span
                            className={`
                                text-[10px] font-bold uppercase tracking-widest transition-all duration-200
                                ${isActive
                                    ? 'text-primary translate-x-0 opacity-100'
                                    : 'text-muted-foreground -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                                }
                            `}
                        >
                            {section.label}
                        </span>
                    </a>
                );
            })}
        </nav>
    );
}
