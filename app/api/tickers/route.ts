/**
 * Historical price feed.
 *
 * GET /api/tickers?tickers=VTI,QQQ,BND&freq=monthly&from=2020-01-01&to=2025-01-01&threshBadData=0.4
 *
 * Returns wide-format pivot — one row per date, one column per ticker —
 * matching the R `data_download()` function semantics.
 *
 * Production hardening on top of v1:
 *   1. 5-minute in-memory TTL cache keyed by (tickers, freq, from, to)
 *   2. threshBadData parameter (R's thresh_bad_data) — drops tickers with
 *      too many missing rows
 *   3. One retry on rate-limit / transient error
 *   4. Reports dropped tickers in the response envelope
 */

import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf = new YahooFinance();

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

const FREQ_MAP: Record<Frequency, '1d' | '1wk' | '1mo' | '3mo'> = {
  daily: '1d',
  weekly: '1wk',
  monthly: '1mo',
  // yfR maps "yearly" to annual; yahoo-finance2 caps at 3mo, we approximate.
  yearly: '3mo',
};

// ── In-memory TTL cache ──────────────────────────────────────────────────
// Keyed by the full request signature. 5-minute TTL. Process-local.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; payload: unknown }>();

function cacheKey(tickers: string[], freq: Frequency, from: string, to: string, thresh: number): string {
  return `${tickers.join('|')}::${freq}::${from}::${to}::${thresh}`;
}

// ── Fetch with one retry ─────────────────────────────────────────────────

async function fetchWithRetry(ticker: string, period1: string, period2: string, interval: '1d' | '1wk' | '1mo' | '3mo') {
  try {
    return await yf.chart(ticker, { period1, period2, interval });
  } catch (_err) {
    // One retry after 1s for transient errors.
    await new Promise(r => setTimeout(r, 1000));
    return await yf.chart(ticker, { period1, period2, interval });
  }
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const tickersParam   = searchParams.get('tickers');
  const freqParam      = (searchParams.get('freq') ?? 'monthly') as Frequency;
  const from           = searchParams.get('from');
  const to             = searchParams.get('to');
  const threshParam    = searchParams.get('threshBadData');
  const threshBadData  = threshParam != null ? Math.max(0, Math.min(1, Number(threshParam))) : 0.4;

  if (!tickersParam || !from || !to) {
    return NextResponse.json(
      { error: 'Required params: tickers (comma-separated), from (YYYY-MM-DD), to (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  if (!FREQ_MAP[freqParam]) {
    return NextResponse.json(
      { error: `freq must be one of: ${Object.keys(FREQ_MAP).join(', ')}` },
      { status: 400 }
    );
  }

  const tickers = tickersParam
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ error: 'tickers list is empty' }, { status: 400 });
  }

  // Cache lookup.
  const key = cacheKey(tickers, freqParam, from, to, threshBadData);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    const payload = hit.payload as object;
    return NextResponse.json({ ...payload, cacheHit: true });
  }

  try {
    const interval = FREQ_MAP[freqParam];

    // Fetch all tickers in parallel, isolating per-ticker errors so one
    // bad ticker doesn't kill the whole response.
    const fetched = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const result = await fetchWithRetry(ticker, from, to, interval);
          return { ticker, quotes: result.quotes ?? [], error: null as string | null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown error';
          return { ticker, quotes: [], error: msg };
        }
      })
    );

    // Determine the universe of dates (union across all tickers).
    const allDates = new Set<string>();
    for (const f of fetched) {
      for (const q of f.quotes) {
        if (!q.date || q.adjclose == null) continue;
        allDates.add(q.date.toISOString().slice(0, 10));
      }
    }
    const expectedRows = allDates.size;

    // Apply threshBadData: drop a ticker if its valid points / expectedRows
    // is below (1 - threshBadData). Matches R's yfR threshold semantics.
    const dropped: string[] = [];
    const kept: typeof fetched = [];
    for (const f of fetched) {
      const validCount = f.quotes.filter(q => q.adjclose != null && q.date).length;
      const ratio = expectedRows === 0 ? 0 : validCount / expectedRows;
      if (f.error || ratio < 1 - threshBadData) {
        dropped.push(f.ticker);
      } else {
        kept.push(f);
      }
    }

    // Pivot wide.
    const rowsByDate = new Map<string, Record<string, string | number | null>>();
    for (const { ticker, quotes } of kept) {
      for (const q of quotes) {
        if (!q.date || q.adjclose == null) continue;
        const day = q.date.toISOString().slice(0, 10);
        if (!rowsByDate.has(day)) rowsByDate.set(day, { ref_date: day });
        rowsByDate.get(day)![ticker] = q.adjclose;
      }
    }

    const rows = Array.from(rowsByDate.values()).sort((a, b) =>
      String(b.ref_date).localeCompare(String(a.ref_date))
    );

    const payload = {
      tickers: kept.map(k => k.ticker),
      dropped,
      freq: freqParam,
      from,
      to,
      threshBadData,
      rows,
      fetchedAt: Date.now(),
      cacheHit: false,
    };

    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { error: `Yahoo Finance fetch failed: ${message}` },
      { status: 502 }
    );
  }
}
