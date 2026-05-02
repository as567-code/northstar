'use client';

import { useEffect } from 'react';
import type { EnrichedHolding, Goal, AllocationMap } from '@/lib/types';
import { TARGET_ALLOCATIONS } from '@/lib/types';
import { fmtUSDFull, type ScenarioConfig } from '@/lib/sim';

interface Trade {
  action: 'SELL' | 'BUY';
  symbol: string;
  amount: number;
  rationale?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  holdings: EnrichedHolding[];
  totalValue: number;
  alloc: AllocationMap;
  goal: Goal | null;
  /** When set, the drawer adapts to a specific scenario instead of generic rebalance. */
  scenarioConfig?: ScenarioConfig | null;
}

/** Build trade list. Scenario-aware: certain shocks bias the rebalance direction. */
function buildTrades(
  holdings: EnrichedHolding[],
  totalValue: number,
  alloc: AllocationMap,
  goal: Goal | null,
  scenario?: ScenarioConfig | null
): { trades: Trade[]; targetAlloc: AllocationMap; rationale: string } {
  const profile = goal?.riskProfile ?? 'Balanced';
  let target: AllocationMap = { ...TARGET_ALLOCATIONS[profile] };

  // Scenario-adjusted target: the receipt should suggest a defense relevant
  // to the active stress test, not a generic rebalance.
  let rationale = `Your ${profile} profile says you should hold ${target.equity}% in stocks. You currently hold ${Math.round(alloc.equity)}%.`;

  if (scenario?.withdrawal?.on) {
    // Bias toward bonds enough to cover the withdrawal.
    const withdrawalPct = (scenario.withdrawal.amount / totalValue) * 100;
    const extraBonds = Math.min(20, Math.max(0, withdrawalPct - 5));
    target = { ...target, bonds: target.bonds + extraBonds, equity: Math.max(0, target.equity - extraBonds) };
    rationale = `You'd be withdrawing ${fmtUSDFull(scenario.withdrawal.amount)} soon. We'd raise bonds to ${target.bonds}% so the withdrawal doesn't force a fire-sale of stocks.`;
  } else if (scenario?.inflation?.on && scenario.inflation.ratePct >= 6) {
    target = { ...target, gold: 18, equity: Math.max(0, target.equity - (18 - target.gold)) };
    rationale = `${scenario.inflation.ratePct}% inflation for ${scenario.inflation.years} years would silently erode your purchasing power. Lifting gold from ${alloc.gold}% to 18% adds an inflation hedge.`;
  } else if (scenario?.marketShock?.on) {
    rationale = `A ${Math.round(scenario.marketShock.dropPct * 100)}% market drop would hurt because you're carrying ${Math.round(alloc.equity)}% in stocks. We'd take some chips off the table and lock in a slice of the gains.`;
  }

  // Compute drift in dollars.
  const equityDelta = ((target.equity - alloc.equity) / 100) * totalValue;
  const bondsDelta  = ((target.bonds  - alloc.bonds)  / 100) * totalValue;
  const goldDelta   = ((target.gold   - alloc.gold)   / 100) * totalValue;

  const trades: Trade[] = [];

  // SELLS: where we're over-allocated.
  if (equityDelta < -100) {
    // Sell from largest equity positions first.
    const equityPositions = holdings
      .filter(h => h.assetClass === 'equity' && (h.value ?? 0) > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    let toSell = -equityDelta;
    for (const p of equityPositions) {
      if (toSell < 100) break;
      const sellAmount = Math.min(toSell, (p.value ?? 0) * 0.5); // never sell more than half a position
      if (sellAmount >= 100) {
        trades.push({ action: 'SELL', symbol: p.symbol, amount: Math.round(sellAmount) });
        toSell -= sellAmount;
      }
    }
  }
  if (goldDelta < -100) {
    const gp = holdings.find(h => h.assetClass === 'gold' && (h.value ?? 0) > 0);
    if (gp) trades.push({ action: 'SELL', symbol: gp.symbol, amount: Math.round(-goldDelta) });
  }

  // BUYS: where we're under-allocated.
  if (bondsDelta > 100) {
    const bondPick = holdings.find(h => h.assetClass === 'bonds') ?? { symbol: 'BND', value: 0 } as EnrichedHolding;
    trades.push({ action: 'BUY', symbol: bondPick.symbol ?? 'BND', amount: Math.round(bondsDelta) });
  }
  if (goldDelta > 100) {
    const goldPick = holdings.find(h => h.assetClass === 'gold') ?? { symbol: 'GLD' } as EnrichedHolding;
    trades.push({ action: 'BUY', symbol: goldPick.symbol ?? 'GLD', amount: Math.round(goldDelta) });
  }
  if (equityDelta > 100) {
    const eqPick = holdings.find(h => h.assetClass === 'equity') ?? { symbol: 'VTI' } as EnrichedHolding;
    trades.push({ action: 'BUY', symbol: eqPick.symbol ?? 'VTI', amount: Math.round(equityDelta) });
  }

  return { trades, targetAlloc: target, rationale };
}

const LTCG_RATE_BY_PROFILE: Record<string, number> = {
  Cautious: 0,    // assume lower bracket
  Balanced: 0.15,
  Growth:   0.15,
};
// Approximation: ~10% of sale proceeds are realized gains.
const GAINS_FRACTION = 0.10;

export default function ReceiptDrawer({ open, onClose, holdings, totalValue, alloc, goal, scenarioConfig }: Props) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const { trades, rationale } = buildTrades(holdings, totalValue, alloc, goal, scenarioConfig);
  const totalMoved = trades.reduce((s, t) => s + t.amount, 0);
  const sellTotal = trades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.amount, 0);
  const profile = goal?.riskProfile ?? 'Balanced';
  const ltcgRate = LTCG_RATE_BY_PROFILE[profile] ?? 0.15;

  const commission = 0;
  const secFee = totalMoved * 0.0000278; // SEC Section 31 fee
  const slippage = totalMoved * 0.0003;
  const taxImpact = sellTotal * GAINS_FRACTION * ltcgRate;
  const totalCost = commission + secFee + slippage + taxImpact;

  const isScenario = scenarioConfig != null;

  return (
    <>
      <div
        className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Transparency receipt"
        className="fixed top-0 right-0 bottom-0 w-[480px] max-w-[92vw] bg-paper border-l border-line z-50 overflow-y-auto"
      >
        <div className="px-8 pt-7 pb-5 border-b border-line bg-card">
          <div className="flex items-start justify-between mb-3">
            <div className="eyebrow">Transparency receipt</div>
            <button onClick={onClose} className="text-ink-3 hover:text-ink text-[20px] leading-none" aria-label="Close">×</button>
          </div>
          <h2 className="font-serif text-[28px] leading-tight">
            {isScenario ? <>How to protect against <em className="italic">this scenario</em></> : <>Why we'd <em className="italic">rebalance</em></>}
          </h2>
        </div>

        <div className="px-8 py-6 border-b border-line">
          <div className="eyebrow mb-3">The Why</div>
          <p className="font-serif italic text-[16px] text-ink-2 leading-relaxed">{rationale}</p>
        </div>

        {trades.length > 0 ? (
          <>
            <div className="px-8 py-6 border-b border-line">
              <div className="eyebrow mb-4">The Trades</div>
              <div className="space-y-2.5">
                {trades.map((t, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-smallcap rounded font-mono border ${t.action === 'SELL' ? 'border-terra text-terra' : 'border-forest text-forest'}`}>
                        {t.action}
                      </span>
                      <span className="font-mono text-[14px]">{t.symbol}</span>
                    </div>
                    <span className="font-mono text-[14px]">{fmtUSDFull(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-8 py-6 border-b border-line">
              <div className="eyebrow mb-4">The Cost</div>
              <div className="space-y-2 font-mono text-[13px]">
                <Row label="Commission" sub="Free at most US brokers" value="$0.00" />
                <Row label="SEC + TAF fees" value={`$${secFee.toFixed(2)}`} />
                <Row label="Slippage est." sub="3 bps on moved volume" value={`$${slippage.toFixed(2)}`} />
                <Row
                  label="Tax estimate"
                  sub={`LTCG ~${Math.round(ltcgRate * 100)}% × ~${Math.round(GAINS_FRACTION * 100)}% gains`}
                  value={`$${taxImpact.toFixed(2)}`}
                />
                <div className="pt-2 mt-2 border-t border-line flex items-baseline justify-between">
                  <span className="text-[12px] uppercase tracking-eyebrow text-ink-3">Total cost</span>
                  <span className="font-mono text-[16px] font-medium">${totalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="px-8 py-6 border-b border-line">
              <div className="eyebrow mb-3">The Outcome</div>
              <p className="text-[13px] text-ink-2 leading-relaxed">
                {isScenario && scenarioConfig?.marketShock?.on
                  ? <>In a {Math.round(scenarioConfig.marketShock.dropPct * 100)}% market drop, this rebalance reduces your equity exposure before the drop hits — limiting the damage. Your goal {goal ? 'stays on track' : 'is protected'}.</>
                  : <>This rebalance brings your allocation in line with your {profile} profile. Less drama in the next downturn, same compounding upside.</>
                }
              </p>
            </div>
          </>
        ) : (
          <div className="px-8 py-10 text-center">
            <div className="font-serif italic text-[18px] text-ink-2">
              No trades needed — your allocation is already on target.
            </div>
          </div>
        )}

        <div className="px-8 py-5 text-[11px] text-ink-3">
          Estimates only — not financial advice. Tax math assumes US long-term capital gains and approximate gains fraction.
        </div>
      </aside>
    </>
  );
}

function Row({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div>
        <div className="text-ink">{label}</div>
        {sub && <div className="text-[11px] text-ink-3 mt-0.5">{sub}</div>}
      </div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
