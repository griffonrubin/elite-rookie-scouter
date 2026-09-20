'use client';

import React from 'react';

/**
 * What the playoff odds on this page do not know about your league.
 *
 * The simulation plays a single table: it ranks twelve teams by wins,
 * breaks ties on points, and takes the top however-many. In a league split
 * into divisions that is usually not the rule. Division winners take the
 * first seeds, so a team leading a weak division can be through on a
 * record that would miss in one table, and a strong second-place team can
 * miss on one that would walk it. Every number downstream of the odds —
 * what this week is worth, what a claim is worth, who to root for — is
 * wrong by however much that matters.
 *
 * It is said rather than modelled because modelling it means knowing which
 * seeding rule the league uses, and that is a platform setting this cannot
 * read. A guessed rule producing confident odds is worse than a stated
 * assumption a reader can correct for: an owner who knows they are second
 * in a strong division can read "this understates me" off one sentence,
 * and cannot read anything at all off a number that looked certain.
 *
 * Silent in the overwhelming majority of leagues, which have one table and
 * for which these odds are simply right.
 */
export function DivisionsNote({ divisions, className }: {
    divisions: number | null | undefined;
    className?: string;
}) {
    if (!divisions || divisions < 2) return null;
    return (
        <p data-note="divisions"
            className={className ?? `text-[10px] text-muted-foreground/45
                                     leading-relaxed max-w-[660px]`}>
            Your league has {divisions} divisions, and these odds do not model
            them — the season is played out as one table and the top finishers
            make it. Where division winners are seeded first, this understates a
            team leading a weak division and overstates a strong one stuck behind
            it. Everything priced in playoff odds here inherits that.
        </p>
    );
}
