// Asset-class classifier.
// Strategy: fast hardcoded lookup for the most common tickers, fall back to
// security-type heuristics for unknowns.
//
// We don't fetch Yahoo metadata in this module — that's the job of /api/quote
// to populate `name` and `securityType`. The classifier turns those into our
// internal AssetClass enum.

import type { AssetClass, SecurityType } from './types';

/** Hardcoded map of common tickers → asset class. Curated, not exhaustive. */
const HARDCODED: Record<string, { assetClass: AssetClass; securityType: SecurityType; name?: string }> = {
  // Broad-market US equity ETFs
  VTI:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard Total Stock Market' },
  VOO:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard S&P 500' },
  SPY:    { assetClass: 'equity', securityType: 'ETF', name: 'SPDR S&P 500' },
  IVV:    { assetClass: 'equity', securityType: 'ETF', name: 'iShares Core S&P 500' },
  QQQ:    { assetClass: 'equity', securityType: 'ETF', name: 'Invesco Nasdaq 100' },
  QQQM:   { assetClass: 'equity', securityType: 'ETF', name: 'Invesco Nasdaq 100' },
  DIA:    { assetClass: 'equity', securityType: 'ETF', name: 'SPDR Dow Jones Industrial Avg' },
  IWM:    { assetClass: 'equity', securityType: 'ETF', name: 'iShares Russell 2000' },
  VXUS:   { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard Total Intl Stock' },
  VEA:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard FTSE Developed Markets' },
  VWO:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard FTSE Emerging Markets' },
  AVUV:   { assetClass: 'equity', securityType: 'ETF', name: 'Avantis US Small Cap Value' },
  SCHD:   { assetClass: 'equity', securityType: 'ETF', name: 'Schwab US Dividend Equity' },
  VYM:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard High Dividend Yield' },
  VTV:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard Value' },
  VUG:    { assetClass: 'equity', securityType: 'ETF', name: 'Vanguard Growth' },
  ARKK:   { assetClass: 'equity', securityType: 'ETF', name: 'ARK Innovation' },

  // Mutual funds (5-letter ending in X)
  FXAIX:  { assetClass: 'equity', securityType: 'MUTUAL_FUND', name: 'Fidelity 500 Index' },
  VFIAX:  { assetClass: 'equity', securityType: 'MUTUAL_FUND', name: 'Vanguard 500 Index Admiral' },
  VTSAX:  { assetClass: 'equity', securityType: 'MUTUAL_FUND', name: 'Vanguard Total Stock Mkt Admiral' },
  FCNTX:  { assetClass: 'equity', securityType: 'MUTUAL_FUND', name: 'Fidelity Contrafund' },
  FZROX:  { assetClass: 'equity', securityType: 'MUTUAL_FUND', name: 'Fidelity ZERO Total Mkt Index' },
  FSKAX:  { assetClass: 'equity', securityType: 'MUTUAL_FUND', name: 'Fidelity Total Mkt Index' },
  FXNAX:  { assetClass: 'bonds',  securityType: 'MUTUAL_FUND', name: 'Fidelity US Bond Index' },
  VBTLX:  { assetClass: 'bonds',  securityType: 'MUTUAL_FUND', name: 'Vanguard Total Bond Mkt Admiral' },

  // Bond ETFs
  BND:    { assetClass: 'bonds', securityType: 'ETF', name: 'Vanguard Total Bond Market' },
  AGG:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares Core US Aggregate Bond' },
  TLT:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares 20+ Year Treasury' },
  IEF:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares 7-10 Year Treasury' },
  SHY:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares 1-3 Year Treasury' },
  TIP:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares TIPS Bond' },
  VTEB:   { assetClass: 'bonds', securityType: 'ETF', name: 'Vanguard Tax-Exempt Bond' },
  MUB:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares National Muni Bond' },
  LQD:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares Investment Grade Corp' },
  HYG:    { assetClass: 'bonds', securityType: 'ETF', name: 'iShares High Yield Corp Bond' },
  BNDX:   { assetClass: 'bonds', securityType: 'ETF', name: 'Vanguard Total Intl Bond' },

  // Gold / commodities
  GLD:    { assetClass: 'gold', securityType: 'ETF', name: 'SPDR Gold Shares' },
  IAU:    { assetClass: 'gold', securityType: 'ETF', name: 'iShares Gold Trust' },
  SGOL:   { assetClass: 'gold', securityType: 'ETF', name: 'abrdn Physical Gold Shares' },
  SLV:    { assetClass: 'gold', securityType: 'ETF', name: 'iShares Silver Trust' },

  // Cash-equivalent / money-market
  BIL:    { assetClass: 'cash', securityType: 'ETF', name: 'SPDR 1-3 Month T-Bill' },
  SGOV:   { assetClass: 'cash', securityType: 'ETF', name: 'iShares 0-3 Month Treasury' },

  // Single-name common stocks (mega-caps that beginners actually own)
  AAPL:   { assetClass: 'equity', securityType: 'STOCK', name: 'Apple' },
  MSFT:   { assetClass: 'equity', securityType: 'STOCK', name: 'Microsoft' },
  GOOGL:  { assetClass: 'equity', securityType: 'STOCK', name: 'Alphabet Class A' },
  GOOG:   { assetClass: 'equity', securityType: 'STOCK', name: 'Alphabet Class C' },
  AMZN:   { assetClass: 'equity', securityType: 'STOCK', name: 'Amazon' },
  META:   { assetClass: 'equity', securityType: 'STOCK', name: 'Meta Platforms' },
  NVDA:   { assetClass: 'equity', securityType: 'STOCK', name: 'NVIDIA' },
  TSLA:   { assetClass: 'equity', securityType: 'STOCK', name: 'Tesla' },
  BRK_B:  { assetClass: 'equity', securityType: 'STOCK', name: 'Berkshire Hathaway B' },
  'BRK-B':{ assetClass: 'equity', securityType: 'STOCK', name: 'Berkshire Hathaway B' },
  JPM:    { assetClass: 'equity', securityType: 'STOCK', name: 'JPMorgan Chase' },
  V:      { assetClass: 'equity', securityType: 'STOCK', name: 'Visa' },
  MA:     { assetClass: 'equity', securityType: 'STOCK', name: 'Mastercard' },
  JNJ:    { assetClass: 'equity', securityType: 'STOCK', name: 'Johnson & Johnson' },
  WMT:    { assetClass: 'equity', securityType: 'STOCK', name: 'Walmart' },
  PG:     { assetClass: 'equity', securityType: 'STOCK', name: 'Procter & Gamble' },
  HD:     { assetClass: 'equity', securityType: 'STOCK', name: 'Home Depot' },
  XOM:    { assetClass: 'equity', securityType: 'STOCK', name: 'Exxon Mobil' },
  KO:     { assetClass: 'equity', securityType: 'STOCK', name: 'Coca-Cola' },
  PEP:    { assetClass: 'equity', securityType: 'STOCK', name: 'PepsiCo' },
  DIS:    { assetClass: 'equity', securityType: 'STOCK', name: 'Walt Disney' },
  NFLX:   { assetClass: 'equity', securityType: 'STOCK', name: 'Netflix' },
};

export interface ClassificationResult {
  assetClass: AssetClass;
  securityType: SecurityType;
  name?: string;
  /** True when we matched the hardcoded table; false when we guessed. */
  confident: boolean;
}

/**
 * Classify a ticker symbol into an asset class and security type.
 * Confident=true when we hit the curated table; false when we fall back
 * to symbol heuristics (5-letter symbols ending in X are typically mutual
 * funds, etc.). The dashboard surfaces the unconfident cases as warnings.
 */
export function classifyTicker(rawSymbol: string): ClassificationResult {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) {
    return { assetClass: 'other', securityType: 'OTHER', confident: false };
  }

  const hit = HARDCODED[symbol];
  if (hit) {
    return { ...hit, confident: true };
  }

  // Heuristic fallback.
  // 5 chars ending in X → US mutual fund convention (e.g., FXAIX, VFIAX).
  if (symbol.length === 5 && symbol.endsWith('X')) {
    return { assetClass: 'equity', securityType: 'MUTUAL_FUND', confident: false };
  }
  // Tickers ending in -USD or containing crypto markers → other.
  if (symbol.includes('-USD') || symbol.endsWith('USD')) {
    return { assetClass: 'other', securityType: 'OTHER', confident: false };
  }
  // Default: treat as equity stock with low confidence.
  return { assetClass: 'equity', securityType: 'STOCK', confident: false };
}

/** Display label for security type. */
export function securityTypeLabel(t: SecurityType): string {
  switch (t) {
    case 'STOCK': return 'Stock';
    case 'ETF': return 'ETF';
    case 'MUTUAL_FUND': return 'Mutual fund';
    case 'BOND': return 'Bond';
    case 'OTHER': return 'Other';
  }
}

/** Display label for asset class. */
export function assetClassLabel(c: AssetClass): string {
  switch (c) {
    case 'equity': return 'Stocks';
    case 'bonds':  return 'Bonds';
    case 'gold':   return 'Gold';
    case 'cash':   return 'Cash';
    case 'other':  return 'Other';
  }
}

/** Color token for asset-class dot/bar. Matches Tailwind config. */
export function assetClassColor(c: AssetClass): string {
  switch (c) {
    case 'equity': return 'var(--forest)';
    case 'bonds':  return 'var(--slate)';
    case 'gold':   return 'var(--gold)';
    case 'cash':   return 'var(--ink-3)';
    case 'other':  return 'var(--ink-3)';
  }
}
