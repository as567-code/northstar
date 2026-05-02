/**
 * Live quote endpoint.
 *
 * GET /api/quote?symbols=VTI,QQQ,BND
 *
 * Returns current price, day-change %, YTD-change %, and display name for
 * each symbol. 60-second TTL cache. Used by the holdings table to refresh
 * prices without hammering Yahoo.
 */

import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf = new YahooFinance();

const TTL_MS = 60 * 1000;
type CachedQuote = {
  symbol: string;
  price: number | null;
  dayChangePct: number | null;
  ytdChangePct: number | null;
  name?: string;
  fetchedAt: number;
};
const cache = new Map<string, CachedQuote>();

async function fetchQuote(symbol: string): Promise<CachedQuote> {
  // Check cache.
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;

  try {
    // 1. Current price via quote() — gets live regular-market data.
    const q = await yf.quote(symbol);
    const price = (q?.regularMarketPrice ?? null) as number | null;
    const dayChangePct = (q?.regularMarketChangePercent ?? null) as number | null;
    const name = (q?.longName || q?.shortName || symbol) as string;

    // 2. YTD change — fetch year-start price via chart().
    let ytdChangePct: number | null = null;
    try {
      const yearStart = `${new Date().getUTCFullYear()}-01-01`;
      const today = new Date().toISOString().slice(0, 10);
      const hist = await yf.chart(symbol, { period1: yearStart, period2: today, interval: '1mo' });
      const firstClose = hist.quotes?.find(c => c.adjclose != null)?.adjclose;
      if (price != null && firstClose != null && firstClose > 0) {
        ytdChangePct = ((price - firstClose) / firstClose) * 100;
      }
    } catch {
      // Ignore YTD failures — quote still useful.
    }

    const result: CachedQuote = {
      symbol,
      price,
      dayChangePct: dayChangePct != null ? Number(dayChangePct.toFixed(4)) : null,
      ytdChangePct: ytdChangePct != null ? Number(ytdChangePct.toFixed(4)) : null,
      name,
      fetchedAt: Date.now(),
    };
    cache.set(symbol, result);
    return result;
  } catch (_err) {
    const stale: CachedQuote = {
      symbol,
      price: null,
      dayChangePct: null,
      ytdChangePct: null,
      name: symbol,
      fetchedAt: Date.now(),
    };
    return stale;
  }
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols');
  if (!symbolsParam) {
    return NextResponse.json({ error: 'Required param: symbols (comma-separated)' }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols list is empty' }, { status: 400 });
  }

  if (symbols.length > 50) {
    return NextResponse.json({ error: 'max 50 symbols per request' }, { status: 400 });
  }

  const quotes = await Promise.all(symbols.map(fetchQuote));

  return NextResponse.json({
    quotes,
    fetchedAt: Date.now(),
  });
}
