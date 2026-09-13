import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 1st, 2nd, 3rd, 4th — and 11th, 12th, 13th.
 *
 * Written out because `${n}th` is the version everybody ships by accident,
 * and it reads as a bug the moment a table has a second place in it: the
 * trade page said "2th → 12th in the league" beside a number it had
 * simulated twenty thousand times.
 */
export function ordinal(n: number): string {
    const rem100 = Math.abs(n) % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    switch (Math.abs(n) % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}
