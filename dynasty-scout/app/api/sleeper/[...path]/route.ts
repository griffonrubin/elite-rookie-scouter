import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Same-origin relay for Sleeper's public read API.
 *
 * The draft sync fetches api.sleeper.app straight from the browser; this
 * route is its fallback for any environment where that cross-origin call
 * fails (a strict browser, an extension, a network that rewrites CORS).
 * It is stateless and read-only: GET only, path segments whitelisted to
 * the characters Sleeper ids and routes use, nothing logged or stored —
 * the user's draft connection still lives only in their browser.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const { path } = await params;
    if (!path?.length || path.length > 6 || !path.every(seg => /^[A-Za-z0-9_.-]{1,64}$/.test(seg))) {
        return Response.json({ error: 'bad path' }, { status: 400 });
    }

    try {
        const upstream = await fetch(`https://api.sleeper.app/v1/${path.join('/')}`, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
        });
        const body = await upstream.text();
        return new Response(body, {
            status: upstream.status,
            headers: {
                'content-type': 'application/json',
                'cache-control': 'no-store',
            },
        });
    } catch {
        return Response.json({ error: 'sleeper unreachable' }, { status: 502 });
    }
}
