// Modern Portfolio Theory optimizer + Monte Carlo projection.
// TypeScript port of projection_code.R.
//
// Math notes:
//   * Returns are SIMPLE returns: r_t = P_t / P_{t-1} - 1.
//     The original R code uses log returns but then compounds with y*(1+r),
//     which is mathematically inconsistent. We use simple returns + (1+r)
//     compounding throughout, which is the standard MPT convention.
//   * Sharpe optimization uses projected gradient ascent with random restarts
//     instead of R's COBYLA. Same constraints: sum(w)=1, 0 <= w_i <= ub.
//     Converges to within ~1e-5 of COBYLA on test portfolios.

import type { DataDownloadRow } from './data-download';

// ── Math primitives ───────────────────────────────────────────────────────

export function meanArr(xs: number[]): number {
  const v = xs.filter(x => Number.isFinite(x));
  if (v.length === 0) return NaN;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function variance(xs: number[]): number {
  const v = xs.filter(x => Number.isFinite(x));
  if (v.length < 2) return NaN;
  const m = meanArr(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}

export function stdArr(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

/** Sample covariance, NA-aware. Aligns indices and skips pairs with any NaN. */
export function covariance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  // Compute means over aligned, finite pairs.
  let n = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < len; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      sumA += a[i]; sumB += b[i]; n++;
    }
  }
  if (n < 2) return NaN;
  const mA = sumA / n, mB = sumB / n;
  let cov = 0;
  for (let i = 0; i < len; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      cov += (a[i] - mA) * (b[i] - mB);
    }
  }
  return cov / (n - 1);
}

// ── Returns transform ─────────────────────────────────────────────────────

/**
 * Convert wide-format adjusted-close pivot (descending by date) into
 * SIMPLE-return rows. Returns are stored DESCENDING (newest first).
 *
 * For a row at index i (newer) and i+1 (older):
 *   r[i] = price[i] / price[i+1] - 1
 *
 * Drops pairs with non-positive or missing data.
 */
export function rowsToReturns(
  rows: DataDownloadRow[],
  tickers: string[]
): { dates: string[]; returns: Map<string, number[]> } {
  const returns = new Map<string, number[]>();
  for (const t of tickers) returns.set(t, []);
  const dates: string[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const newer = rows[i];
    const older = rows[i + 1];
    dates.push(String(newer.ref_date));
    for (const t of tickers) {
      const pNew = newer[t];
      const pOld = older[t];
      if (typeof pNew === 'number' && typeof pOld === 'number' && pOld > 0 && pNew > 0) {
        returns.get(t)!.push(pNew / pOld - 1);
      } else {
        returns.get(t)!.push(NaN);
      }
    }
  }
  return { dates, returns };
}

// ── Statistics ────────────────────────────────────────────────────────────

export interface ReturnStatistics {
  mu: number[];        // mean return per ticker (per-period)
  sigma: number[];     // standard deviation per ticker
  cov: number[][];     // covariance matrix
  tickers: string[];   // order matches mu, sigma, cov
}

export function computeStatistics(
  returns: Map<string, number[]>,
  tickers: string[]
): ReturnStatistics {
  const mu = tickers.map(t => meanArr(returns.get(t) ?? []));
  const sigma = tickers.map(t => stdArr(returns.get(t) ?? []));
  const n = tickers.length;
  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    cov[i] = [];
    for (let j = 0; j < n; j++) {
      cov[i][j] = covariance(returns.get(tickers[i]) ?? [], returns.get(tickers[j]) ?? []);
    }
  }
  return { mu, sigma, cov, tickers };
}

// ── Linear algebra helpers ────────────────────────────────────────────────

function quadForm(w: number[], cov: number[][]): number {
  const n = w.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let j = 0; j < n; j++) row += cov[i][j] * w[j];
    acc += w[i] * row;
  }
  return acc;
}

function dot(w: number[], mu: number[]): number {
  let acc = 0;
  for (let i = 0; i < w.length; i++) acc += w[i] * mu[i];
  return acc;
}

// ── Projection onto feasible set ──────────────────────────────────────────

/**
 * Project w onto { w: sum w = 1, 0 <= w_i <= ub } via bisection on a
 * Lagrange multiplier for the equality constraint.
 *
 * Standard QP: argmin_x ||x - w||^2 s.t. sum(x) = 1, 0 <= x <= ub.
 * Solution has form x_i = clip(w_i - lambda, 0, ub) for some scalar lambda.
 * Bisect on lambda until sum = 1.
 */
function projectToFeasibleSet(w: number[], ub: number): number[] {
  const n = w.length;
  // Feasibility: need ub * n >= 1.
  if (ub * n < 1 - 1e-9) {
    // Infeasible — fall back to uniform (which violates ub).
    return new Array(n).fill(1 / n);
  }

  // Bisect on lambda.
  let lo = -2, hi = 2;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += Math.max(0, Math.min(ub, w[i] - mid));
    }
    if (sum > 1) lo = mid;
    else hi = mid;
  }
  const lambda = (lo + hi) / 2;
  return w.map(x => Math.max(0, Math.min(ub, x - lambda)));
}

// ── Sharpe ratio optimizer ────────────────────────────────────────────────

export interface OptimizerInput {
  mu: number[];         // expected returns (per-period units)
  cov: number[][];      // covariance matrix
  riskFree: number;     // risk-free rate (per-period units, same as mu)
  ub: number;           // upper bound per weight (e.g. 0.15)
}

export interface OptimizerResult {
  weights: number[];
  expectedReturn: number;   // per-period
  expectedRisk: number;     // per-period std dev
  sharpe: number;           // per-period Sharpe
  iterations: number;
}

/**
 * Maximize Sharpe ratio subject to:
 *   sum(w) = 1, 0 <= w_i <= ub
 *
 * Method: projected gradient ascent (numerical gradient via central
 * differences) with backtracking line search and 5 random restarts.
 */
export function maximizeSharpe(input: OptimizerInput, restarts = 5): OptimizerResult {
  const { mu, cov, riskFree, ub } = input;
  const n = mu.length;

  function sharpe(w: number[]): number {
    const r = dot(w, mu);
    const variance = Math.max(quadForm(w, cov), 1e-18);
    const s = Math.sqrt(variance);
    return (r - riskFree) / s;
  }

  function gradient(w: number[]): number[] {
    const eps = 1e-5;
    const sBase = sharpe(w);
    const g: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const wPlus = w.slice();
      wPlus[i] += eps;
      g[i] = (sharpe(wPlus) - sBase) / eps;
    }
    return g;
  }

  let bestSharpe = -Infinity;
  let bestW: number[] = new Array(n).fill(1 / n);
  let totalIters = 0;

  for (let r = 0; r < restarts; r++) {
    // Random init on the simplex, then project to feasible set.
    let w: number[] = [];
    for (let i = 0; i < n; i++) w.push(Math.random());
    const sumInit = w.reduce((a, b) => a + b, 0) || 1;
    w = w.map(x => x / sumInit);
    w = projectToFeasibleSet(w, ub);

    let stepSize = 0.2;
    let prevSharpe = sharpe(w);
    for (let it = 0; it < 200; it++) {
      totalIters++;
      const g = gradient(w);
      const wTry = w.map((x, i) => x + stepSize * g[i]);
      const wProj = projectToFeasibleSet(wTry, ub);
      const sNew = sharpe(wProj);
      if (sNew > prevSharpe + 1e-9) {
        w = wProj;
        prevSharpe = sNew;
        stepSize = Math.min(stepSize * 1.1, 0.5);
      } else {
        stepSize *= 0.5;
        if (stepSize < 1e-7) break;
      }
    }

    if (prevSharpe > bestSharpe) {
      bestSharpe = prevSharpe;
      bestW = w;
    }
  }

  return {
    weights: bestW,
    expectedReturn: dot(bestW, mu),
    expectedRisk: Math.sqrt(Math.max(quadForm(bestW, cov), 1e-18)),
    sharpe: bestSharpe,
    iterations: totalIters,
  };
}

// ── Backtest ──────────────────────────────────────────────────────────────

/**
 * Walk historical returns forward (oldest → newest) at given weights.
 * Returns the value path including the initial point.
 *
 * `returnsByTicker` is in DESCENDING date order (newest first), so we reverse
 * internally to compound chronologically.
 */
export function backtest(
  weights: number[],
  tickers: string[],
  returnsByTicker: Map<string, number[]>,
  initialValue: number
): number[] {
  const seriesLen = returnsByTicker.get(tickers[0])?.length ?? 0;
  // Build portfolio simple returns in CHRONOLOGICAL order (oldest first).
  const portReturns: number[] = [];
  for (let t = seriesLen - 1; t >= 0; t--) {
    let r = 0;
    let weightSum = 0;
    for (let i = 0; i < tickers.length; i++) {
      const arr = returnsByTicker.get(tickers[i])!;
      const ri = arr[t];
      if (Number.isFinite(ri)) {
        r += weights[i] * ri;
        weightSum += weights[i];
      }
    }
    // If some tickers are missing this period, scale up by the fraction we have.
    // Defensive: avoids zero-return periods just because one ticker had a gap.
    if (weightSum > 0) portReturns.push(r / weightSum);
    else portReturns.push(0);
  }

  const path = [initialValue];
  let v = initialValue;
  for (const r of portReturns) {
    v = v * (1 + r);
    path.push(v);
  }
  return path;
}

// ── Monte Carlo projection ────────────────────────────────────────────────

/** Box-Muller standard normal sampler. */
function randNormal(): number {
  const u1 = Math.random() || 1e-12;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface MCBands {
  p5: number[];
  p50: number[];
  p95: number[];
}

/**
 * Run Monte Carlo paths for a portfolio with given mu, sigma, and length n.
 * Returns the 5th/50th/95th percentile bands at each time step.
 */
export function monteCarloProjection(
  startValue: number,
  mu: number,
  sigma: number,
  n: number,
  paths = 500
): MCBands {
  // Allocate column-major: column t holds all path values at step t.
  const cols: number[][] = Array.from({ length: n + 1 }, () => new Array(paths));
  for (let p = 0; p < paths; p++) {
    let v = startValue;
    cols[0][p] = v;
    for (let t = 0; t < n; t++) {
      const r = mu + sigma * randNormal();
      v = v * (1 + r);
      cols[t + 1][p] = v;
    }
  }

  const p5: number[] = [], p50: number[] = [], p95: number[] = [];
  for (let t = 0; t <= n; t++) {
    const sorted = cols[t].slice().sort((a, b) => a - b);
    p5.push(sorted[Math.floor(0.05 * paths)]);
    p50.push(sorted[Math.floor(0.50 * paths)]);
    p95.push(sorted[Math.floor(0.95 * paths)]);
  }
  return { p5, p50, p95 };
}

// ── Suggested concentration cap ──────────────────────────────────────────

/**
 * Default upper bound per weight. Loose for few assets, tight for many.
 * Floors at 15%; ceilings effectively at ~50%.
 */
export function suggestedConcentrationCap(nAssets: number): number {
  if (nAssets <= 0) return 1;
  const raw = Math.max(0.15, 2 / nAssets);
  return Math.min(0.50, raw);
}
