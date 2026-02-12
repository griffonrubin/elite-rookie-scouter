import { getScoutAgent } from '@/lib/scout/agent';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * API Route: Trigger Internet Scan
 * GET /api/scan
 * 
 * Triggers the Scout Agent to scan RSS feeds for new prospect news
 */
export async function GET() {
    try {
        const agent = getScoutAgent();
        const result = await agent.scanInternet();

        return NextResponse.json({
            success: true,
            data: result,
            message: `Scan complete! Found ${result.newProspectMentions} prospect mentions from ${result.itemsFound} total items.`,
        });
    } catch (error) {
        console.error('Scan error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to scan internet',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
