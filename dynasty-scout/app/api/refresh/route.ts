import { NextResponse } from 'next/server';

export async function POST() {
    // Data refresh via Python scrapers is a local-only operation.
    // Run scrapers locally: python scrapers/run_rankings.py
    return NextResponse.json(
        { error: 'Data refresh must be triggered locally via Python scrapers.' },
        { status: 501 }
    );
}
