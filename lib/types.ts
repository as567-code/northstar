// Production type model. Single source of truth.
// No personas, no demo data, no aspirational fields.

export type AssetClass = 'equity' | 'bonds' | 'gold' | 'cash' | 'other';
export type SecurityType = 'STOCK' | 'ETF' | 'MUTUAL_FUND' | 'BOND' | 'OTHER';
export type RiskProfile = 'Cautious' | 'Balanced' | 'Growth';

/** A single position the user owns. */
export interface Holding {
  /** UUID — generated client-side at add time. */
  id: string;
  /** Uppercase ticker symbol. */
  symbol: string;
  /** Display name — populated from price API on add. */
  name?: string;
  /** Number of shares. Float allowed (fractional shares). */
  shares: number;
  /** ISO date string YYYY-MM-DD. Optional — defaults to today. */
  purchasedAt?: string;
  /** Cost basis per share. Optional — falls back to current price if absent. */
  costBasis?: number;
  /** Asset class — resolved by the classifier on add. */
  assetClass: AssetClass;
  /** Security type — for the unified-dashboard "Stock vs Mutual Fund" badges. */
  securityType: SecurityType;
}

/** Live quote payload from /api/quote. */
export interface Quote {
  symbol: string;
  price: number | null;
  /** Day change as a decimal (0.0042 = +0.42%). null if unavailable. */
  dayChangePct: number | null;
  /** YTD change as a decimal. null if unavailable. */
  ytdChangePct: number | null;
  /** Display name from the data provider. */
  name?: string;
  /** When this quote was fetched (ms epoch). */
  fetchedAt: number;
}

/** Optional user-defined goal. Drives target allocation + risk advice. */
export interface Goal {
  /** Free-text label, e.g., "House down payment". */
  label: string;
  /** Dollar target. */
  target: number;
  /** Years until needed. */
  horizonYears: number;
  /** Risk profile — derived from horizon if not user-set. */
  riskProfile: RiskProfile;
}

/** The single document persisted to localStorage. */
export interface Portfolio {
  holdings: Holding[];
  goal: Goal | null;
  /** Version for migration. */
  schemaVersion: number;
}

/** A holding row enriched with live price + computed value. Used for rendering. */
export interface EnrichedHolding extends Holding {
  price: number | null;
  value: number | null;
  dayChangePct: number | null;
  ytdChangePct: number | null;
  /** Total return on this position vs cost basis. null if cost basis unavailable. */
  totalReturnPct: number | null;
  /** Dollar return on this position. */
  totalReturnUsd: number | null;
  /** True if no live data was returned for this symbol. */
  isStale: boolean;
}

/** Allocation breakdown by asset class (percentages, sums to ~100). */
export type AllocationMap = Record<AssetClass, number>;

/** Target allocations by risk profile (sums to 100 each). */
export const TARGET_ALLOCATIONS: Record<RiskProfile, AllocationMap> = {
  Cautious: { equity: 30, bonds: 60, gold: 10, cash: 0, other: 0 },
  Balanced: { equity: 60, bonds: 30, gold: 10, cash: 0, other: 0 },
  Growth:   { equity: 80, bonds: 10, gold: 10, cash: 0, other: 0 },
};

/** Default risk profile inference from horizon. */
export function riskProfileFromHorizon(years: number): RiskProfile {
  if (years <= 4) return 'Cautious';
  if (years <= 10) return 'Balanced';
  return 'Growth';
}

export const SCHEMA_VERSION = 1;
