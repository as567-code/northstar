'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { dataDownload, type Frequency } from '@/lib/data-download';
import {
  rowsToReturns,
  computeStatistics,
  maximizeSharpe,
  backtest,
  monteCarloProjection,
  meanArr,
  stdArr,
  suggestedConcentrationCap,
  type MCBands,
} from '@/lib/optimizer';
import type { EnrichedHolding } from '@/lib/types';
import { fmtUSDFull } from '@/lib/sim';

interface Props {
  holdings: EnrichedHolding[];
  totalValue: number;
}

interface OptimizationResult {
  optTickers: string[];
  weights: number[];
  expectedReturn: number;
  expectedRisk: number;
  sharpe: number;
  backtest: number[];
  projection: MCBands;
  spyBacktest: number[];
  spyProjection: MCBands;
  periodsPerYear: number;
  nPeriods: number;
  dates: string[];
  dropped: string[];
}

const PERIODS_PER_YEAR: Record<Frequency, number> = {
  daily: 252,
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

export default function ProjectionLab({ holdings, totalValue }: Props) {
  const tickers = useMemo(() => holdings.map(h => h.symbol), [holdings]);
  const tickersKey = tickers.join(',');

  // Controls
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [riskFreeAnnual, setRiskFreeAnnual] = useState(3);
  const [lookbackYears, setLookbackYears] = useState(5);
  const [concCapPct, setConcCapPct] = useState<number>(
    Math.round(suggestedConcentrationCap(Math.max(2, tickers.length)) * 100)
  );

  // Data state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);

  const recompute = useCallback(async () => {
    if (tickers.length < 2) {
      setError('Need at least 2 holdings to optimize.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const from = new Date(today);
      from.setFullYear(today.getFullYear() - lookbackYears);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = today.toISOString().slice(0, 10);

      // Always include SPY as a benchmark.
      const allTickers = Array.from(new Set([...tickers, 'SPY']));
      const data = await dataDownload({
        tickers: allTickers, freq, from: fromStr, to: toStr,
      });

      // Convert to simple returns.
      const { returns, dates } = rowsToReturns(data.rows, data.tickers);

      // Filter optimizer to user's holdings that survived threshBadData.
      const optTickers = tickers.filter(t => data.tickers.includes(t));
      if (optTickers.length < 2) {
        throw new Error('Not enough tickers with sufficient data. Check the data range.');
      }

      // Compute stats and run optimizer.
      const stats = computeStatistics(returns, optTickers);
      const periodsPerYear = PERIODS_PER_YEAR[freq];
      const rfPerPeriod = riskFreeAnnual / 100 / periodsPerYear;
      const ub = concCapPct / 100;

      const opt = maximizeSharpe(
        { mu: stats.mu, cov: stats.cov, riskFree: rfPerPeriod, ub },
        5
      );

      // Backtest from current portfolio value.
      const portBacktest = backtest(opt.weights, optTickers, returns, totalValue);

      // Forward projection from end of backtest.
      const portFwd = monteCarloProjection(
        portBacktest[portBacktest.length - 1],
        opt.expectedReturn,
        opt.expectedRisk,
        portBacktest.length - 1,  // project same length as historical
        500
      );

      // SPY benchmark.
      const spyReturns = returns.get('SPY') ?? [];
      const spyMu = meanArr(spyReturns);
      const spySigma = stdArr(spyReturns);
      const spyMap = new Map([['SPY', spyReturns]]);
      const spyBacktest = backtest([1], ['SPY'], spyMap, totalValue);
      const spyFwd = monteCarloProjection(
        spyBacktest[spyBacktest.length - 1],
        spyMu, spySigma, spyBacktest.length - 1, 500
      );

      setResult({
        optTickers,
        weights: opt.weights,
        expectedReturn: opt.expectedReturn,
        expectedRisk: opt.expectedRisk,
        sharpe: opt.sharpe,
        backtest: portBacktest,
        projection: portFwd,
        spyBacktest,
        spyProjection: spyFwd,
        periodsPerYear,
        nPeriods: portBacktest.length - 1,
        dates,
        dropped: data.dropped,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed.');
      setResult(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, freq, lookbackYears, riskFreeAnnual, concCapPct, totalValue]);

  // Auto-run on mount and when inputs change.
  useEffect(() => {
    if (tickers.length >= 2) recompute();
  }, [recompute, tickers.length]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <section className="bg-card border border-line rounded-card overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-line">
        <div className="eyebrow mb-3">Optimization lab</div>
        <h2 className="font-serif text-[32px] leading-tight">
          What if you held the <em className="italic">optimal</em> portfolio?
        </h2>
        <p className="font-serif italic text-[16px] text-ink-2 mt-2 max-w-[680px] leading-relaxed">
          Modern Portfolio Theory finds the weights that maximize return per unit of risk.
          Fitted to your real tickers&apos; returns, then projected forward against the S&amp;P 500.
        </p>
      </div>

      {/* Controls */}
      <div className="px-8 py-4 border-b border-line flex flex-wrap items-end gap-x-6 gap-y-3">
        <Control label="Lookback">
          <select
            value={lookbackYears}
            onChange={e => setLookbackYears(Number(e.target.value))}
            className="font-mono text-[13px] px-3 py-1.5 bg-paper border border-line rounded-md"
          >
            <option value={3}>3 years</option>
            <option value={5}>5 years</option>
            <option value={10}>10 years</option>
          </select>
        </Control>
        <Control label="Frequency">
          <select
            value={freq}
            onChange={e => setFreq(e.target.value as Frequency)}
            className="font-mono text-[13px] px-3 py-1.5 bg-paper border border-line rounded-md"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Control>
        <Control label="Risk-free rate">
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={0} max={20} step={0.25}
              value={riskFreeAnnual}
              onChange={e => setRiskFreeAnnual(Number(e.target.value))}
              className="w-16 font-mono text-[13px] px-2 py-1.5 bg-paper border border-line rounded-md"
            />
            <span className="text-[12px] text-ink-3">%/yr</span>
          </div>
        </Control>
        <Control label="Concentration cap">
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={5} max={100} step={1}
              value={concCapPct}
              onChange={e => setConcCapPct(Number(e.target.value))}
              className="w-16 font-mono text-[13px] px-2 py-1.5 bg-paper border border-line rounded-md"
            />
            <span className="text-[12px] text-ink-3">% per asset</span>
          </div>
        </Control>
        <button
          onClick={recompute}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded-full border border-line text-[12px] hover:bg-paper transition disabled:opacity-50"
        >
          {loading ? 'Computing…' : 'Recompute'}
        </button>
      </div>

      {/* Body */}
      {tickers.length < 2 ? (
        <div className="p-12 text-center font-serif italic text-[18px] text-ink-2">
          Optimization needs at least 2 holdings. Add a few more to see what&apos;s optimal.
        </div>
      ) : error ? (
        <div className="p-10 text-center">
          <div className="eyebrow text-terra mb-2">Could not optimize</div>
          <p className="font-serif italic text-[16px] text-ink-2 max-w-[420px] mx-auto leading-relaxed">{error}</p>
        </div>
      ) : !result ? (
        <div className="p-12">
          <SkeletonResult />
        </div>
      ) : (
        <>
          {result.dropped.length > 0 && (
            <div className="mx-8 mt-4 px-3 py-2 rounded-md bg-terra/10 border border-terra/30 text-terra text-[12px]">
              {result.dropped.length} ticker{result.dropped.length === 1 ? '' : 's'} excluded for insufficient data: {result.dropped.join(', ')}.
            </div>
          )}
          <div className="grid grid-cols-[420px_1fr] gap-0">
            {/* LEFT: weights + stats */}
            <div className="p-8 border-r border-line">
              <h3 className="font-serif text-[20px] mb-1">Recommended weights</h3>
              <p className="text-[12px] text-ink-3 mb-5">vs. your current allocation</p>

              <WeightsTable
                holdings={holdings}
                optTickers={result.optTickers}
                weights={result.weights}
                totalValue={totalValue}
              />

              <div className="mt-7 pt-6 border-t border-line">
                <div className="grid grid-cols-3 gap-3">
                  <Stat
                    label="Expected return"
                    value={`${(result.expectedReturn * result.periodsPerYear * 100).toFixed(1)}%`}
                    sub="annualized"
                  />
                  <Stat
                    label="Volatility"
                    value={`${(result.expectedRisk * Math.sqrt(result.periodsPerYear) * 100).toFixed(1)}%`}
                    sub="annualized"
                  />
                  <Stat
                    label="Sharpe"
                    value={result.sharpe > 0 ? (result.sharpe * Math.sqrt(result.periodsPerYear)).toFixed(2) : '—'}
                    sub="annualized"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT: projection chart */}
            <div className="p-8">
              <h3 className="font-serif text-[20px] mb-1">{lookbackYears}-year backtest + {lookbackYears}-year projection</h3>
              <p className="text-[12px] text-ink-3 mb-5">
                If you&apos;d held the optimal portfolio with {fmtUSDFull(totalValue)} {lookbackYears} years ago, then continued holding it.
              </p>

              <ProjectionChart result={result} startValue={totalValue} />

              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                <Legend color="#2F5D3F" label="Optimal portfolio (median)" />
                <Legend color="#2F5D3F" label="5–95th percentile cone" pattern="band" />
                <Legend color="#4B5567" label="S&P 500 (median)" />
              </div>
            </div>
          </div>

          {/* Outcome line */}
          <div className="px-8 pt-6 pb-2 border-t border-line bg-paper/30">
            <p className="font-serif italic text-[16px] text-ink-2 leading-relaxed max-w-[920px]">
              <OutcomeNarrative result={result} startValue={totalValue} lookbackYears={lookbackYears} />
            </p>
          </div>
        </>
      )}

      {/* Math disclosure */}
      <details className="border-t border-line">
        <summary className="px-8 py-4 cursor-pointer text-[13px] text-ink-2 hover:text-ink hover:bg-paper/40 transition select-none">
          How is this calculated? <span className="text-ink-3 ml-2">(show the math)</span>
        </summary>
        <div className="px-8 pb-7 pt-1 bg-paper/30 text-[13px] text-ink-2 leading-relaxed space-y-3">
          <p>
            <strong className="font-medium text-ink">1. Returns.</strong> For each ticker, simple monthly returns are computed from adjusted closes:
            <span className="font-mono text-[12px] block mt-1 text-ink"> r<sub>t</sub> = P<sub>t</sub> / P<sub>t−1</sub> − 1</span>
          </p>
          <p>
            <strong className="font-medium text-ink">2. Statistics.</strong> Per-period mean μ, standard deviation σ, and full covariance matrix Σ are estimated from the lookback window. Pairwise covariances skip rows missing data on either ticker.
          </p>
          <p>
            <strong className="font-medium text-ink">3. Optimization.</strong> We maximize the Sharpe ratio subject to no shorting and a per-asset concentration cap:
            <span className="font-mono text-[12px] block mt-1 text-ink"> max<sub>w</sub> (w&apos;μ − r<sub>f</sub>) / √(w&apos;Σw) &nbsp; s.t. &nbsp; Σw<sub>i</sub> = 1, &nbsp; 0 ≤ w<sub>i</sub> ≤ ub</span>
            We use projected gradient ascent with 5 random restarts; the original R reference uses COBYLA. Both converge to the same Markowitz tangency portfolio under these constraints.
          </p>
          <p>
            <strong className="font-medium text-ink">4. Backtest.</strong> The recommended weights are applied multiplicatively to historical returns: V<sub>t+1</sub> = V<sub>t</sub> · (1 + Σ w<sub>i</sub>·r<sub>i,t</sub>).
          </p>
          <p>
            <strong className="font-medium text-ink">5. Projection.</strong> 500 Monte Carlo paths drawn from N(μ<sub>p</sub>, σ<sub>p</sub>) where μ<sub>p</sub> = w&apos;μ and σ<sub>p</sub> = √(w&apos;Σw). The chart shows the 5th, 50th, and 95th percentiles at each step.
          </p>
          <p className="pt-2 border-t border-line/60 text-[12px] text-ink-3">
            <strong className="text-ink-2">Caveats.</strong> Single-period MPT assumes returns are normally distributed and stationary. Both assumptions are wrong in real markets — fat tails are real, correlations spike during crises. Treat the cone as a sketch of uncertainty, not a forecast. Past returns don&apos;t guarantee future ones.
          </p>
        </div>
      </details>
    </section>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="font-mono text-[20px] tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  );
}

function Legend({ color, label, pattern }: { color: string; label: string; pattern?: 'band' }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
      {pattern === 'band' ? (
        <span className="w-3 h-2.5 rounded-sm" style={{ background: color, opacity: 0.18 }} />
      ) : (
        <span className="w-3 h-0.5" style={{ background: color }} />
      )}
      {label}
    </div>
  );
}

function WeightsTable({
  holdings, optTickers, weights, totalValue,
}: {
  holdings: EnrichedHolding[]; optTickers: string[]; weights: number[]; totalValue: number;
}) {
  // Build current weights from holdings.
  const currentByTicker = new Map<string, number>();
  for (const h of holdings) {
    const v = h.value ?? 0;
    currentByTicker.set(h.symbol, totalValue > 0 ? v / totalValue : 0);
  }

  const rows = optTickers.map((t, i) => ({
    symbol: t,
    current: currentByTicker.get(t) ?? 0,
    recommended: weights[i],
    delta: weights[i] - (currentByTicker.get(t) ?? 0),
  }));

  rows.sort((a, b) => b.recommended - a.recommended);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_70px_70px_60px] gap-2 text-[10px] uppercase tracking-smallcap text-ink-3 mb-1 px-1">
        <div>Ticker</div>
        <div className="text-right">Current</div>
        <div className="text-right">Optimal</div>
        <div className="text-right">Δ</div>
      </div>
      {rows.map(r => {
        const recPct = r.recommended * 100;
        return (
          <div key={r.symbol} className="grid grid-cols-[1fr_70px_70px_60px] gap-2 items-center py-1 px-1 hover:bg-paper/40 transition rounded">
            <div className="font-mono text-[13px]">{r.symbol}</div>
            <div className="text-right font-mono text-[12px] text-ink-3">{(r.current * 100).toFixed(1)}%</div>
            <div className="text-right font-mono text-[13px] relative">
              <div className="absolute inset-y-0 right-0 w-full rounded-sm bg-forest/10" style={{ width: `${Math.min(100, recPct * 1.5)}%` }} />
              <span className="relative">{recPct.toFixed(1)}%</span>
            </div>
            <div
              className="text-right font-mono text-[11px]"
              style={{ color: Math.abs(r.delta) < 0.01 ? 'var(--ink-3)' : (r.delta > 0 ? 'var(--forest)' : 'var(--terra)') }}
            >
              {r.delta >= 0 ? '+' : ''}{(r.delta * 100).toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectionChart({ result, startValue }: { result: OptimizationResult; startValue: number }) {
  const W = 600, H = 260, PAD_L = 56, PAD_R = 12, PAD_T = 16, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Build series concatenated: backtest (chronological) + projection (forward).
  const backtest = result.backtest;
  const fwd = result.projection;
  const spyBacktest = result.spyBacktest;
  const spyFwd = result.spyProjection;

  // X axis: 0 .. (backtest.length - 1) is past; (backtest.length - 1) .. end is future.
  const totalLen = backtest.length + (fwd.p50.length - 1);
  const todayIdx = backtest.length - 1;

  // Y range: take 2nd-98th percentile of all values to avoid extreme cone outliers dominating.
  const allValues = [
    ...backtest, ...fwd.p5, ...fwd.p95,
    ...spyBacktest, ...spyFwd.p5, ...spyFwd.p95,
  ].filter(Number.isFinite);
  const sorted = allValues.slice().sort((a, b) => a - b);
  const yLo = sorted[Math.floor(0.01 * sorted.length)] ?? startValue * 0.5;
  const yHi = sorted[Math.floor(0.99 * sorted.length)] ?? startValue * 2;

  function xPos(i: number) { return PAD_L + (i / Math.max(1, totalLen - 1)) * innerW; }
  function yPos(v: number) {
    const range = Math.max(1, yHi - yLo);
    return PAD_T + (1 - (v - yLo) / range) * innerH;
  }

  // Build path strings.
  function buildLine(values: number[], offset: number) {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(offset + i)} ${yPos(v)}`).join(' ');
  }
  function buildBand(p5: number[], p95: number[], offset: number) {
    const top = p5.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(offset + i)} ${yPos(v)}`).join(' ');
    const bot = p95.map((v, i) => `L ${xPos(offset + p95.length - 1 - i)} ${yPos(p95[p95.length - 1 - i])}`).join(' ');
    return `${top} ${bot} Z`;
  }

  // Y-axis tick values.
  const yTicks = [yLo, yLo + (yHi - yLo) * 0.25, yLo + (yHi - yLo) * 0.5, yLo + (yHi - yLo) * 0.75, yHi];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Y grid + labels */}
      {yTicks.map((tv, i) => {
        const y = yPos(tv);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(14,27,44,0.06)" />
            <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#8B92A1" fontFamily="monospace">
              {fmtUSDFull(tv)}
            </text>
          </g>
        );
      })}

      {/* Today divider */}
      <line
        x1={xPos(todayIdx)} y1={PAD_T}
        x2={xPos(todayIdx)} y2={H - PAD_B}
        stroke="rgba(14,27,44,0.20)" strokeDasharray="3 3"
      />
      <text x={xPos(todayIdx)} y={PAD_T - 4} textAnchor="middle" fontSize="9" fill="#8B92A1" fontFamily="monospace">
        TODAY
      </text>

      {/* SPY band + line (drawn first so optimal sits on top) */}
      <path d={buildBand(spyFwd.p5, spyFwd.p95, todayIdx)} fill="#4B5567" fillOpacity="0.10" />
      <path d={buildLine(spyBacktest, 0)} fill="none" stroke="#4B5567" strokeWidth="1.2" strokeDasharray="4 2" />
      <path d={buildLine(spyFwd.p50, todayIdx)} fill="none" stroke="#4B5567" strokeWidth="1.2" strokeDasharray="4 2" />

      {/* Optimal portfolio band + line */}
      <path d={buildBand(fwd.p5, fwd.p95, todayIdx)} fill="#2F5D3F" fillOpacity="0.18" />
      <path d={buildLine(backtest, 0)} fill="none" stroke="#2F5D3F" strokeWidth="1.6" />
      <path d={buildLine(fwd.p50, todayIdx)} fill="none" stroke="#2F5D3F" strokeWidth="1.6" />

      {/* Start dot */}
      <circle cx={xPos(0)} cy={yPos(startValue)} r="3" fill="#2F5D3F" />

      {/* X-axis labels */}
      <text x={xPos(0)} y={H - PAD_B + 14} textAnchor="start" fontSize="9" fill="#8B92A1" fontFamily="monospace">
        −{Math.round((todayIdx / result.periodsPerYear))}y
      </text>
      <text x={xPos(todayIdx)} y={H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="#8B92A1" fontFamily="monospace">
        now
      </text>
      <text x={xPos(totalLen - 1)} y={H - PAD_B + 14} textAnchor="end" fontSize="9" fill="#8B92A1" fontFamily="monospace">
        +{Math.round(((totalLen - 1 - todayIdx) / result.periodsPerYear))}y
      </text>
    </svg>
  );
}

function OutcomeNarrative({
  result, startValue, lookbackYears,
}: {
  result: OptimizationResult; startValue: number; lookbackYears: number;
}) {
  const optEndBacktest = result.backtest[result.backtest.length - 1];
  const spyEndBacktest = result.spyBacktest[result.spyBacktest.length - 1];
  const optMedianFuture = result.projection.p50[result.projection.p50.length - 1];
  const spyMedianFuture = result.spyProjection.p50[result.spyProjection.p50.length - 1];

  const optBeatsSpyBacktest = optEndBacktest > spyEndBacktest;
  const optMultiple = startValue > 0 ? optEndBacktest / startValue : 1;
  const spyMultiple = startValue > 0 ? spyEndBacktest / startValue : 1;

  return (
    <>
      Had you held this optimal portfolio for the past {lookbackYears} years, your {fmtUSDFull(startValue)} would have grown to <strong className="text-ink not-italic font-medium">{fmtUSDFull(optEndBacktest)}</strong> ({optMultiple.toFixed(2)}×) — {optBeatsSpyBacktest ? <>ahead of the S&amp;P&apos;s {fmtUSDFull(spyEndBacktest)} ({spyMultiple.toFixed(2)}×).</> : <>behind the S&amp;P&apos;s {fmtUSDFull(spyEndBacktest)} ({spyMultiple.toFixed(2)}×).</>} The Monte Carlo median for the next {lookbackYears} years lands around <strong className="text-ink not-italic font-medium">{fmtUSDFull(optMedianFuture)}</strong> for the optimal mix vs. {fmtUSDFull(spyMedianFuture)} for the S&amp;P — but the cone is wide on both, and that gap is well within noise.
    </>
  );
}

function SkeletonResult() {
  return (
    <div className="space-y-3 max-w-[420px]">
      <div className="h-3 bg-line rounded animate-pulse w-1/2" />
      <div className="h-3 bg-line rounded animate-pulse w-3/4" />
      <div className="h-3 bg-line rounded animate-pulse w-2/3" />
      <div className="h-32 bg-line rounded animate-pulse mt-6" />
    </div>
  );
}
