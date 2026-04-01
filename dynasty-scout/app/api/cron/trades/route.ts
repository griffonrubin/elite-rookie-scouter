import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes timeout for Vercel

export async function GET(req: NextRequest) {
  try {
    // Verify Vercel cron secret (optional but recommended)
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.VERCEL_CRON_SECRET && secret !== process.env.VERCEL_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run the Python scraper
    try {
      const output = execSync('python scrapers/trades_sleeper.py', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 280000, // 4m 40s
      });

      return NextResponse.json({
        status: 'success',
        message: 'Trades scraper completed',
        output: output.slice(-500), // Last 500 chars
        timestamp: new Date().toISOString(),
      });
    } catch (execErr: any) {
      // Scraper may have exit code 0 but still output errors
      return NextResponse.json({
        status: 'completed',
        message: 'Scraper ran (check logs)',
        output: execErr.stdout?.slice(-500) || execErr.message,
        timestamp: new Date().toISOString(),
      });
    }
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
