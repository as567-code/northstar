// Simulation primitives — operate on the live portfolio, not personas.
// All shocks accept (allocationPct, totalValue) and return a numeric outcome.
// The merged stress-test panel composes these.

import type { AllocationMap, AssetClass, EnrichedHolding, Goal, RiskProfile } from './types';
import { TARGET_ALLOCATIONS } from './types';

// ── Core math ────────────────────────────────────────────────────────────

const RISK_SCORE_BY_CLASS: Record<AssetClass, number> = {
  equity: 5,
  bonds:  1,
  gold:   2,
  cash:   0,
  other:  3,
};

/** Sum holdings into total dollar value. */
export function totalValue(holdings: EnrichedHolding[]): number {
  return holdings.reduce((s, h) => s + (h.value ?? 0), 0);
}

/** Compute current allocation (percentages summing to ~100). */
export function computeAllocation(holdings: EnrichedHolding[]): AllocationMap {
  const total = totalValue(holdings);
  const result: AllocationMap = { equity: 0, bonds: 0, gold: 0, cash: 0, other: 0 };
  if (total <= 0) return result;
  for (const h of holdings) {
    const v = h.value ?? 0;
    result[h.assetClass] += (v / total) * 100;
  }
  return result;
}

/** Risk score on a 0-5 scale. Weighted by allocation. */
export function calcRiskScore(alloc: AllocationMap): number {
  const total = (Object.values(alloc) as number[]).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let weighted = 0;
  for (const k of Object.keys(alloc) as AssetClass[]) {
    weighted += (alloc[k] / total) * RISK_SCORE_BY_CLASS[k];
  }
  return weighted;
}

export function riskLabel(score: number): 'Very safe' | 'Safe' | 'Balanced' | 'Risky' | 'Very risky' {
  if (score < 1.5) return 'Very safe';
  if (score < 2.5) return 'Safe';
  if (score < 3.5) return 'Balanced';
  if (score < 4.3) return 'Risky';
  return 'Very risky';
}

/** Health score: alignment with target allocation, optionally penalized by short horizon + high equity. */
export function healthScore(alloc: AllocationMap, goal: Goal | null): number {
  // Base: how close are we to the appropriate target?
  const profile: RiskProfile = goal?.riskProfile ?? 'Balanced';
  const target = TARGET_ALLOCATIONS[profile];
  const drift = (Object.keys(target) as AssetClass[])
    .reduce((s, k) => s + Math.abs((alloc[k] ?? 0) - target[k]), 0);
  // drift is in "percentage points summed" — typical max is ~100 for total mismatch.
  const align = Math.max(0, 100 - drift / 2); // /2 because each dollar shows up twice (over + under).

  if (!goal) return Math.round(align);

  // Short-horizon penalty: if you have <5 years AND >60% equity, dock heavily.
  if (goal.horizonYears < 5 && (alloc.equity ?? 0) > 60) {
    const overage = (alloc.equity ?? 0) - 60;
    const penalty = Math.min(40, overage * 1.2);
    return Math.round(Math.max(0, align - penalty));
  }
  return Math.round(align);
}

export function healthLabel(s: number): 'Off course' | 'Drifting' | 'Steady' | 'On course' {
  if (s <= 40) return 'Off course';
  if (s <= 60) return 'Drifting';
  if (s <= 80) return 'Steady';
  return 'On course';
}

export function healthColor(s: number): string {
  if (s <= 40) return '#B85A3E';
  if (s <= 60) return '#C8973A';
  if (s <= 80) return '#8AA17F';
  return '#2F5D3F';
}

// ── Shock primitives ─────────────────────────────────────────────────────
// Each takes the allocation map + total value + shock magnitude.
// Returns the post-shock portfolio value.

/** Market shock: equity drops by dropPct (0-1). Bonds drop ~2%, gold flat. */
export function applyMarketShock(alloc: AllocationMap, total: number, dropPct: number): number {
  const eq = total * (alloc.equity / 100) * (1 - dropPct);
  const bd = total * (alloc.bonds  / 100) * 0.98;
  const gd = total * (alloc.gold   / 100) * 1.0;
  const cs = total * (alloc.cash   / 100) * 1.0;
  const ot = total * (alloc.other  / 100) * (1 - dropPct * 0.7);
  return eq + bd + gd + cs + ot;
}

/** Withdrawal: subtract `amount` from total. Returns post-withdrawal value (floored at 0). */
export function applyWithdrawal(_alloc: AllocationMap, total: number, amount: number): number {
  return Math.max(0, total - amount);
}

/** Inflation erosion: real value after `years` at `ratePct`. */
export function applyInflation(_alloc: AllocationMap, total: number, ratePct: number, years: number): number {
  const factor = Math.pow(1 + ratePct / 100, years);
  return total / factor;
}

/** Rate shock: bonds -6%, equity -3%, gold -1% per 100bps of rise. */
export function applyRateShock(alloc: AllocationMap, total: number, bpsRise: number): number {
  const factor = bpsRise / 100;
  const eq = total * (alloc.equity / 100) * (1 - 0.03 * factor);
  const bd = total * (alloc.bonds  / 100) * (1 - 0.06 * factor);
  const gd = total * (alloc.gold   / 100) * (1 - 0.01 * factor);
  const cs = total * (alloc.cash   / 100) * 1.0;
  const ot = total * (alloc.other  / 100) * (1 - 0.04 * factor);
  return eq + bd + gd + cs + ot;
}

/** Income shock: subtract `monthlyExpense * months` from total. */
export function applyIncomeShock(_alloc: AllocationMap, total: number, monthlyExpense: number, months: number): number {
  return Math.max(0, total - monthlyExpense * months);
}

// ── Combined scenario engine ─────────────────────────────────────────────

export interface ScenarioConfig {
  marketShock?:    { on: boolean; dropPct: number };       // 0-1
  withdrawal?:     { on: boolean; amount: number };
  inflation?:      { on: boolean; ratePct: number; years: number };
  rateShock?:      { on: boolean; bps: number };
  incomeShock?:    { on: boolean; monthlyExpense: number; months: number };
}

export interface ScenarioResult {
  startValue:       number;
  endValue:         number;
  totalLoss:        number;
  totalLossPct:     number;
  /** Per-shock contribution in dollars, computed via leave-one-out. */
  contributions:    Record<keyof ScenarioConfig, number>;
}

const ALL_SHOCKS: (keyof ScenarioConfig)[] = ['marketShock', 'withdrawal', 'inflation', 'rateShock', 'incomeShock'];

function applyOne(alloc: AllocationMap, value: number, key: keyof ScenarioConfig, cfg: ScenarioConfig): number {
  switch (key) {
    case 'marketShock':
      return cfg.marketShock?.on ? applyMarketShock(alloc, value, cfg.marketShock.dropPct) : value;
    case 'withdrawal':
      return cfg.withdrawal?.on ? applyWithdrawal(alloc, value, cfg.withdrawal.amount) : value;
    case 'inflation':
      return cfg.inflation?.on ? applyInflation(alloc, value, cfg.inflation.ratePct, cfg.inflation.years) : value;
    case 'rateShock':
      return cfg.rateShock?.on ? applyRateShock(alloc, value, cfg.rateShock.bps) : value;
    case 'incomeShock':
      return cfg.incomeShock?.on ? applyIncomeShock(alloc, value, cfg.incomeShock.monthlyExpense, cfg.incomeShock.months) : value;
  }
}

/**
 * Multiplicative compounding: apply each enabled shock in sequence.
 * Order matters slightly, but for the magnitudes we use, it's a small effect.
 */
function applyAll(alloc: AllocationMap, startValue: number, cfg: ScenarioConfig): number {
  let v = startValue;
  for (const key of ALL_SHOCKS) v = applyOne(alloc, v, key, cfg);
  return v;
}

/** Run the full combined scenario and return per-shock attribution via leave-one-out. */
export function runScenario(alloc: AllocationMap, startValue: number, cfg: ScenarioConfig): ScenarioResult {
  const endValue = applyAll(alloc, startValue, cfg);
  const totalLoss = startValue - endValue;
  const totalLossPct = startValue > 0 ? (totalLoss / startValue) * 100 : 0;

  // Leave-one-out attribution: re-run without each shock, take the delta.
  const contributions: Record<keyof ScenarioConfig, number> = {
    marketShock: 0, withdrawal: 0, inflation: 0, rateShock: 0, incomeShock: 0,
  };
  for (const key of ALL_SHOCKS) {
    const cfgWithout = { ...cfg, [key]: { ...(cfg[key] ?? {}), on: false } } as ScenarioConfig;
    const valueWithout = applyAll(alloc, startValue, cfgWithout);
    // Contribution = how much MORE was lost because this shock was on.
    contributions[key] = Math.max(0, valueWithout - endValue);
  }

  return { startValue, endValue, totalLoss, totalLossPct, contributions };
}

// ── Formatting helpers ───────────────────────────────────────────────────

export function fmtUSD(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000)    return `$${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtUSDFull(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}
