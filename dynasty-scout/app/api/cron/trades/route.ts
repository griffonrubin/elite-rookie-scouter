import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes timeout for Vercel

export async function GET(req: NextRequest) {
  try {
    // Verify Vercel cron secret (optional but recommended)
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.VERCEL_CRON_SECRET && secret !== process.env.VERCEL_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Note: Python scraper execution is not supported on Vercel's serverless environment
    // Python scripts should be run locally or via a separate service
    // This endpoint serves as a webhook trigger point for trade data refresh
    
    return NextResponse.json({
      status: 'success',
      message: 'Cron job triggered. Trade scraper should be run locally via: python scrapers/trades_sleeper.py',
      timestamp: new Date().toISOString(),
      note: 'Python execution not supported in Vercel serverless. Run scraper locally on your machine.',
    });
  } catch (err) {
    console.error('Cron error:', err);
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
