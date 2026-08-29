'use client';

import { useEffect, useState } from 'react';

/**
 * True below Tailwind's sm breakpoint (640px).
 *
 * Starts false so the server render matches the desktop markup; the phone
 * layout snaps in on hydration. The swap is a column-set change inside an
 * already-rendered table, so it reads as a settle, not a flash.
 */
export function useIsPhone(): boolean {
    const [isPhone, setIsPhone] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const update = () => setIsPhone(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    return isPhone;
}
