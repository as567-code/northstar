// TypeScript port of the R `data_download()` function.
//
// Original R signature:
//   data_download(tickers, freq1, first_date, last_date)
//   - tickers:    character vector
//   - freq1:      "daily" | "weekly" | "monthly" | "yearly"
//   - first_date: "YYYY-MM-DD"
//   - last_date:  "YYYY-MM-DD"
//   Returns: data.frame with one column per ticker, descending by ref_date.
//
// This module is the *client-side wrapper* — it calls our /api/tickers
// endpoint, which in turn calls yahoo-finance2 server-side. Same shape as R.

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface DataDownloadOptions {
  tickers: string[];
  freq?: Frequency;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  /** R default: 0.4. Drop a ticker if more than this fraction is missing. */
  threshBadData?: number;
}

export interface DataDownloadRow {
  ref_date: string;
  [ticker: string]: string | number | null;
}

export interface DataDownloadResult {
  rows: DataDownloadRow[];
  tickers: string[];           // tickers that survived threshBadData
  dropped: string[];           // tickers dropped due to insufficient data
  freq: Frequency;
  from: string;
  to: string;
  fetchedAt: number;
  cacheHit: boolean;
}

/**
 * Mirror of the R data_download() function.
 * Returns wide-format data, descending by date.
 */
export async function dataDownload(opts: DataDownloadOptions): Promise<DataDownloadResult> {
  const {
    tickers,
    freq = 'monthly',
    from,
    to,
    threshBadData = 0.4,
  } = opts;

  if (tickers.length === 0) {
    throw new Error('dataDownload: tickers array is empty');
  }

  const params = new URLSearchParams({
    tickers: tickers.join(','),
    freq,
    from,
    to,
    threshBadData: String(threshBadData),
  });

  const res = await fetch(`/api/tickers?${params.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Yahoo fetch failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  return {
    rows: json.rows ?? [],
    tickers: json.tickers ?? [],
    dropped: json.dropped ?? [],
    freq: json.freq ?? freq,
    from: json.from ?? from,
    to: json.to ?? to,
    fetchedAt: json.fetchedAt ?? Date.now(),
    cacheHit: json.cacheHit ?? false,
  };
}

/** Convert wide-format pivot to a CSV string (for the Download CSV button). */
export function rowsToCsv(rows: DataDownloadRow[], tickers: string[]): string {
  const cols = ['ref_date', ...tickers];
  const header = cols.join(',');
  const body = rows.map(r =>
    cols.map(c => {
      const v = r[c];
      if (v == null) return '';
      if (typeof v === 'number') return v.toFixed(4);
      return String(v);
    }).join(',')
  );
  return [header, ...body].join('\n');
}

/** Trigger a browser download of the rows as CSV. */
export function downloadCsv(
  rows: DataDownloadRow[],
  tickers: string[],
  filename: string
): void {
  if (typeof window === 'undefined') return;
  const csv = rowsToCsv(rows, tickers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
