'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { dataDownload, downloadCsv, type Frequency, type DataDownloadResult } from '@/lib/data-download';

interface Props {
  initialTickers: string[];
}

const TICKER_COLORS: Record<string, string> = {};
const PALETTE = ['#2F5D3F', '#4B5567', '#C8973A', '#B85A3E', '#8AA17F', '#9A7327', '#0E1B2C'];
function colorFor(ticker: string, idx: number): string {
  if (TICKER_COLORS[ticker]) return TICKER_COLORS[ticker];
  TICKER_COLORS[ticker] = PALETTE[idx % PALETTE.length];
  return TICKER_COLORS[ticker];
}

export default function DataInspector({ initialTickers }: Props) {
  const [tickers, setTickers] = useState<string[]>(initialTickers);
  const [freq, setFreq] = useState<Frequency>('monthly');
  const today = new Date();
  const fiveYearsAgo = new Date(today);
  fiveYearsAgo.setFullYear(today.getFullYear() - 5);
  const [from, setFrom] = useState(fiveYearsAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [tab, setTab] = useState<'TABLE' | 'CHART'>('TABLE');
  const [data, setData] = useState<DataDownloadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    if (tickers.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await dataDownload({ tickers, freq, from, to });
      setData(result);
      setBannerDismissed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [tickers, freq, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sync ticker list if initial props change (user adds/removes holdings).
  useEffect(() => {
    setTickers(prev => {
      // If first load, use initial. Otherwise keep user's current selection
      // unless it became empty.
      if (prev.length === 0) return initialTickers;
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeTicker(t: string) {
    setTickers(prev => prev.filter(x => x !== t));
  }
  function addTicker(t: string) {
    const u = t.trim().toUpperCase();
    if (!u || tickers.includes(u)) { setNewTicker(''); setAdding(false); return; }
    setTickers(prev => [...prev, u]);
    setNewTicker(''); setAdding(false);
  }

  function handleCsv() {
    if (!data) return;
    downloadCsv(data.rows, data.tickers, `northstar_${from}_${to}_${freq}.csv`);
  }

  const dropped = data?.dropped ?? [];
  const showBanner = dropped.length > 0 && !bannerDismissed;

  const statusLine = (() => {
    if (loading) return 'Fetching data from Yahoo Finance...';
    if (error) return `Error: ${error}`;
    if (!data) return 'Add tickers to begin.';
    const cacheLabel = data.cacheHit ? 'cache hit' : 'fresh fetch';
    const ago = Math.round((Date.now() - data.fetchedAt) / 1000);
    const agoLabel = ago < 60 ? 'just now' : `${Math.round(ago / 60)} min ago`;
    return `Last fetched ${agoLabel} · ${data.rows.length} rows · ${data.tickers.length} ticker${data.tickers.length === 1 ? '' : 's'} · ${cacheLabel}`;
  })();

  return (
    <section className="bg-card border border-line rounded-card overflow-hidden">
      <div className="px-8 pt-8 pb-6 border-b border-line">
        <div className="eyebrow mb-3">Data Inspector</div>
        <h2 className="font-serif text-[32px] leading-tight">Where the numbers <em className="italic">come from</em>.</h2>
        <p className="font-serif italic text-[16px] text-ink-2 mt-2 max-w-[640px] leading-relaxed">
          Every price on this page is fetched from Yahoo Finance. Inspect the raw history, change the date range, or download what you see.
        </p>
      </div>

      {/* Controls strip */}
      <div className="px-8 py-4 border-b border-line flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex-1 min-w-[260px]">
          <div className="eyebrow mb-1.5">Tickers</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {tickers.length === 0 && !adding ? (
              <button onClick={() => setAdding(true)} className="text-[13px] text-ink-2 hover:text-ink transition">
                + Add a ticker to begin
              </button>
            ) : (
              <>
                {tickers.map(t => {
                  const isWarning = dropped.includes(t);
                  return (
                    <span key={t} className={`inline-flex items-center gap-1 font-mono text-[12px] px-2 py-1 rounded-full border ${isWarning ? 'border-terra/40 bg-terra/10 text-terra' : 'border-line bg-paper text-ink'}`}>
                      {isWarning && '⚠ '}{t}
                      <button
                        onClick={() => removeTicker(t)}
                        className="text-ink-3 hover:text-ink ml-0.5"
                        aria-label={`Remove ${t}`}
                      >×</button>
                    </span>
                  );
                })}
                {adding ? (
                  <input
                    autoFocus
                    value={newTicker}
                    onChange={e => setNewTicker(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addTicker(newTicker);
                      if (e.key === 'Escape') { setAdding(false); setNewTicker(''); }
                    }}
                    onBlur={() => { if (newTicker) addTicker(newTicker); else setAdding(false); }}
                    placeholder="TICKER"
                    className="w-20 font-mono text-[12px] px-2 py-1 bg-paper border border-ink rounded-full"
                  />
                ) : (
                  <button onClick={() => setAdding(true)} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1">
                    + Add ticker
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="eyebrow mb-1.5">Frequency</div>
          <select
            value={freq}
            onChange={e => setFreq(e.target.value as Frequency)}
            className="font-mono text-[13px] px-3 py-1.5 bg-paper border border-line rounded-md"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div>
          <div className="eyebrow mb-1.5">From</div>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">To</div>
          <input type="date" value={to} min={from} max={today.toISOString().slice(0, 10)} onChange={e => setTo(e.target.value)} />
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          aria-label="Refresh"
          className="w-9 h-9 rounded-full border border-line hover:bg-paper transition flex items-center justify-center disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className={loading ? 'animate-spin' : ''}>
            <path d="M2 7 a5 5 0 1 0 1.5-3.5 M3 1 L3 4 L6 4" />
          </svg>
        </button>
      </div>

      <div className="px-8 py-2 text-[11px] font-mono text-ink-3 border-b border-line">
        {statusLine}
      </div>

      {showBanner && (
        <div className="mx-8 mt-4 px-3 py-2 rounded-md bg-terra/10 border border-terra/30 text-terra text-[12px] flex items-center justify-between">
          <span>
            {dropped.length} ticker{dropped.length === 1 ? '' : 's'} excluded — {dropped.join(', ')} {dropped.length === 1 ? 'has' : 'have'} insufficient data for this range.
          </span>
          <button onClick={() => setBannerDismissed(true)} className="text-terra/70 hover:text-terra ml-3">×</button>
        </div>
      )}

      <div className="grid grid-cols-[140px_1fr] min-h-[320px]">
        <nav className="border-r border-line py-4">
          {(['TABLE', 'CHART'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`block w-full text-left px-6 py-2.5 text-[11px] font-medium uppercase tracking-smallcap transition ${
                tab === t ? 'text-ink border-l-2 border-ink' : 'text-ink-3 hover:text-ink border-l-2 border-transparent'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="p-0">
          {tab === 'TABLE' ? (
            <DataTable data={data} loading={loading} error={error} onCsv={handleCsv} tickers={data?.tickers ?? []} />
          ) : (
            <DataChart data={data} loading={loading} error={error} tickers={data?.tickers ?? []} />
          )}
        </div>
      </div>
    </section>
  );
}

function DataTable({ data, loading, error, tickers, onCsv }: { data: DataDownloadResult | null; loading: boolean; error: string | null; tickers: string[]; onCsv: () => void }) {
  if (loading && !data) return <SkeletonRows />;
  if (error && !data)   return <ErrorBlock message={error} />;
  if (!data || data.rows.length === 0) {
    return <div className="p-10 text-center font-serif italic text-[16px] text-ink-2">No data for this selection.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-end px-6 pt-4">
        <button onClick={onCsv} className="font-mono text-[11px] text-ink-2 hover:text-ink underline underline-offset-2 transition">
          Download CSV
        </button>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[10px] uppercase tracking-smallcap text-ink-3 border-b border-line">
              <th className="text-left font-medium py-2 pl-6 pr-3">REF_DATE</th>
              {tickers.map(t => (
                <th key={t} className="text-right font-medium py-2 px-3">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 200).map((row, i) => (
              <tr key={i} className="hover:bg-paper/40 transition border-b border-line/50 last:border-0">
                <td className="py-1.5 pl-6 pr-3 font-mono text-[12px] text-ink-2">{row.ref_date}</td>
                {tickers.map(t => {
                  const v = row[t];
                  return (
                    <td key={t} className="py-1.5 px-3 text-right font-mono text-[12px]">
                      {v == null ? <span className="text-ink-3">—</span> : (typeof v === 'number' ? v.toFixed(2) : String(v))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length > 200 && (
          <div className="text-center text-[11px] text-ink-3 py-3">Showing first 200 rows. Download CSV for the full dataset.</div>
        )}
      </div>
    </div>
  );
}

function DataChart({ data, loading, error, tickers }: { data: DataDownloadResult | null; loading: boolean; error: string | null; tickers: string[] }) {
  const series = useMemo(() => {
    if (!data || tickers.length === 0) return [];
    // Reverse to chronological for plotting.
    const sorted = [...data.rows].reverse();
    return tickers.map((t, idx) => {
      const points = sorted
        .map(r => ({ date: r.ref_date, v: typeof r[t] === 'number' ? (r[t] as number) : null }))
        .filter(p => p.v != null) as { date: string; v: number }[];
      const base = points[0]?.v ?? 1;
      return {
        ticker: t,
        color: colorFor(t, idx),
        points: points.map(p => ({ date: p.date, indexed: (p.v / base) * 100 })),
      };
    });
  }, [data, tickers]);

  if (loading && !data) return <SkeletonChart />;
  if (error && !data)   return <ErrorBlock message={error} />;
  if (!data || series.length === 0) {
    return <div className="p-10 text-center font-serif italic text-[16px] text-ink-2">No data to chart.</div>;
  }

  // Determine y-axis range.
  const allValues = series.flatMap(s => s.points.map(p => p.indexed));
  const minY = Math.min(...allValues, 95);
  const maxY = Math.max(...allValues, 105);
  const W = 880, H = 260, PAD_L = 44, PAD_R = 16, PAD_T = 12, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xCount = Math.max(1, series[0]?.points.length ?? 1) - 1;

  function xpos(i: number) { return PAD_L + (i / Math.max(1, xCount)) * innerW; }
  function ypos(v: number) { return PAD_T + (1 - (v - minY) / (maxY - minY)) * innerH; }

  // Y-axis ticks.
  const yticks = 4;
  const tickValues: number[] = [];
  for (let i = 0; i <= yticks; i++) {
    tickValues.push(minY + (maxY - minY) * (i / yticks));
  }

  return (
    <div className="px-6 py-5">
      <div className="eyebrow mb-3">Indexed · base = 100 at start date</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* Y-axis grid + labels */}
        {tickValues.map((tv, i) => {
          const y = ypos(tv);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(14,27,44,0.06)" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#8B92A1" fontFamily="monospace">{tv.toFixed(0)}</text>
            </g>
          );
        })}
        {/* Lines */}
        {series.map(s => {
          const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xpos(i)} ${ypos(p.indexed)}`).join(' ');
          return (
            <path key={s.ticker} d={path} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          );
        })}
        {/* X-axis labels — first, middle, last */}
        {series[0] && series[0].points.length > 0 && (
          <g fontSize="9" fontFamily="monospace" fill="#8B92A1">
            <text x={xpos(0)} y={H - PAD_B + 14} textAnchor="start">{series[0].points[0].date}</text>
            <text x={xpos(Math.floor(xCount / 2))} y={H - PAD_B + 14} textAnchor="middle">
              {series[0].points[Math.floor(xCount / 2)]?.date ?? ''}
            </text>
            <text x={xpos(xCount)} y={H - PAD_B + 14} textAnchor="end">{series[0].points[xCount]?.date ?? ''}</text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
        {series.map(s => (
          <div key={s.ticker} className="flex items-center gap-1.5 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="font-mono">{s.ticker}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-3 bg-line rounded animate-pulse" style={{ width: `${50 + (i * 7) % 40}%` }} />
      ))}
    </div>
  );
}
function SkeletonChart() {
  return <div className="px-6 py-10"><div className="h-48 bg-line rounded animate-pulse" /></div>;
}
function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="p-10 text-center">
      <div className="eyebrow text-terra mb-2">Could not fetch</div>
      <p className="font-serif italic text-[16px] text-ink-2 max-w-[420px] mx-auto leading-relaxed">
        {message}. Sometimes Yahoo rate-limits during market open. The data shown is from your last successful fetch.
      </p>
    </div>
  );
}
