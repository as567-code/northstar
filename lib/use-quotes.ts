'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Quote, Holding, EnrichedHolding } from './types';

const REFRESH_MS = 60 * 1000; // 60 seconds

interface UseQuotesResult {
  quotes: Map<string, Quote>;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  refresh: () => void;
}

/**
 * Fetch /api/quote for a stable set of symbols. Polls every 60s.
 * Returns a Map<symbol, Quote> for O(1) lookup.
 */
export function useQuotes(symbols: string[]): UseQuotesResult {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  // Stable comma-joined key so the effect only re-runs when the symbol set changes.
  const key = [...symbols].sort().join(',');
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const fetchOnce = useCallback(async () => {
    const syms = symbolsRef.current;
    if (syms.length === 0) {
      setQuotes(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ symbols: syms.join(',') });
      const res = await fetch(`/api/quote?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as { quotes: Quote[] };
      const map = new Map<string, Quote>();
      for (const q of json.quotes) map.set(q.symbol, q);
      setQuotes(map);
      setLastFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    fetchOnce();
    const id = setInterval(fetchOnce, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quotes, loading, error, lastFetchedAt, refresh: fetchOnce };
}

/** Combine raw holdings with live quotes into EnrichedHolding[]. */
export function enrichHoldings(holdings: Holding[], quotes: Map<string, Quote>): EnrichedHolding[] {
  return holdings.map(h => {
    const q = quotes.get(h.symbol);
    const price = q?.price ?? null;
    const value = price != null ? price * h.shares : null;
    const dayChangePct = q?.dayChangePct ?? null;
    const ytdChangePct = q?.ytdChangePct ?? null;
    const costBasis = h.costBasis ?? price ?? null;
    const totalReturnPct = (price != null && costBasis != null && costBasis > 0)
      ? ((price - costBasis) / costBasis) * 100
      : null;
    const totalReturnUsd = (price != null && costBasis != null)
      ? (price - costBasis) * h.shares
      : null;
    return {
      ...h,
      name: q?.name ?? h.name,
      price,
      value,
      dayChangePct,
      ytdChangePct,
      totalReturnPct,
      totalReturnUsd,
      isStale: q == null || price == null,
    };
  });
}
