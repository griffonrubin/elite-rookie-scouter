import React from 'react';

/**
 * The page could not read its data, and says so.
 *
 * Every page here that loads from the database wraps the load in a try and
 * returns an empty list on failure, which renders as a page with nothing on
 * it. That looks like a quiet day rather than a broken one: the chrome is
 * there, the controls are there, the status is a two hundred, and the only
 * evidence is a line in a server log nobody is reading.
 *
 * It is not hypothetical. The positional dropoff page passed its season
 * parameter once to a query that names it twice — correct against Postgres,
 * fatal against the local SQLite shim — and rendered an empty chart for as
 * long as the feature had existed. Nothing found it until a sweep called
 * every route in the app and something else entirely went wrong.
 *
 * So a failed load says it failed. Two audiences, one line of text: a reader
 * learns that the blank page is not an answer about football, and a check
 * can find the marker on a page that is pretending to be fine.
 */

/** What a check greps for. Changing it means changing scripts/serve_check. */
export const LOAD_FAILURE_MARKER = 'data-load-failed';

export function LoadFailure({ what }: { what: string }) {
    return (
        <div
            {...{ [LOAD_FAILURE_MARKER]: 'true' }}
            className="mx-auto my-10 max-w-[560px] rounded-xl border border-dashed
                       px-5 py-6 text-center"
            style={{ borderColor: 'rgba(252,165,165,0.3)' }}>
            <p className="text-[13px] font-semibold" style={{ color: '#FCA5A5' }}>
                Could not load {what}.
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
                This is a fault on our side rather than an answer about football —
                nothing here is empty because there is nothing to show. Reloading
                is worth a try; if it persists the data behind this page needs
                looking at.
            </p>
        </div>
    );
}
