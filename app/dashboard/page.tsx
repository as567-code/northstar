'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePortfolio } from '@/lib/portfolio-store';
import { useQuotes, enrichHoldings } from '@/lib/use-quotes';
import { totalValue as sumValue, computeAllocation, type ScenarioConfig } from '@/lib/sim';
import type { Holding, Goal } from '@/lib/types';

import Header        from '@/components/Header';
import Hero          from '@/components/Hero';
import AllocationCard from '@/components/AllocationCard';
import RiskRibbon    from '@/components/RiskRibbon';
import HoldingsTable from '@/components/HoldingsTable';
import StressTest    from '@/components/StressTest';
import ReceiptDrawer from '@/components/ReceiptDrawer';
import DataInspector from '@/components/DataInspector';
import ProjectionLab from '@/components/ProjectionLab';
import AddHoldingModal from '@/components/AddHoldingModal';
import GoalEditor    from '@/components/GoalEditor';
import EmptyState    from '@/components/EmptyState';

export default function DashboardPage() {
  const { portfolio, hydrated, addHolding, updateHolding, removeHolding, setGoal, reset } = usePortfolio();

  // Live quotes — only fetch after hydration to avoid SSR mismatch.
  const symbols = useMemo(
    () => (hydrated ? portfolio.holdings.map(h => h.symbol) : []),
    [portfolio.holdings, hydrated]
  );
  const { quotes, lastFetchedAt } = useQuotes(symbols);

  // Derive enriched holdings, total value, allocation.
  const enriched   = useMemo(() => enrichHoldings(portfolio.holdings, quotes), [portfolio.holdings, quotes]);
  const totalValue = useMemo(() => sumValue(enriched), [enriched]);
  const alloc      = useMemo(() => computeAllocation(enriched), [enriched]);

  // Modal state.
  const [addOpen, setAddOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editHoldingId, setEditHoldingId] = useState<string | null>(null);
  // When the user opens the receipt from the StressTest panel, we pass the
  // active scenario so the drawer adapts to it. null = generic rebalance.
  const [activeScenario, setActiveScenario] = useState<ScenarioConfig | null>(null);

  const editingHolding = editHoldingId ? portfolio.holdings.find(h => h.id === editHoldingId) ?? null : null;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleAddSingle = useCallback((h: Holding) => addHolding(h), [addHolding]);
  const handleAddMany   = useCallback((arr: Holding[]) => arr.forEach(h => addHolding(h)), [addHolding]);
  const handleSaveGoal  = useCallback((g: Goal | null) => setGoal(g), [setGoal]);

  const handleSeeReceiptFromHero = useCallback(() => {
    setActiveScenario(null);
    setReceiptOpen(true);
  }, []);
  const handleSeeReceiptFromStress = useCallback((cfg: ScenarioConfig) => {
    setActiveScenario(cfg);
    setReceiptOpen(true);
  }, []);

  const handleRunWhatIf = useCallback(() => {
    // Smooth-scroll to the StressTest panel.
    document.getElementById('stress-test')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── SSR safety: render nothing until hydrated, to avoid client/server mismatch.
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="max-w-[1280px] mx-auto px-12 pt-10">
          <div className="font-serif italic text-[20px] text-ink-3">Loading…</div>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (portfolio.holdings.length === 0) {
    return (
      <div className="min-h-screen bg-paper relative">
        <Header
          lastUpdated={lastFetchedAt}
          onAddHolding={() => setAddOpen(true)}
          onEditGoal={() => setGoalOpen(true)}
          onResetPortfolio={reset}
        />
        <EmptyState
          onAdd={handleAddMany}
          onAddSingle={handleAddSingle}
        />
        <AddHoldingModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAddSingle} />
        <GoalEditor open={goalOpen} initial={portfolio.goal} onClose={() => setGoalOpen(false)} onSave={handleSaveGoal} />
      </div>
    );
  }

  // ── Populated state ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper relative">
      <Header
        lastUpdated={lastFetchedAt}
        onAddHolding={() => setAddOpen(true)}
        onEditGoal={() => setGoalOpen(true)}
        onResetPortfolio={reset}
      />

      <Hero
        totalValue={totalValue}
        alloc={alloc}
        goal={portfolio.goal}
        onSeeReceipt={handleSeeReceiptFromHero}
        onRunWhatIf={handleRunWhatIf}
      />

      <main className="max-w-[1280px] mx-auto px-12 space-y-8 pb-24">
        {/* Allocation + Risk side by side */}
        <div className="grid grid-cols-2 gap-6">
          <AllocationCard alloc={alloc} goal={portfolio.goal} />
          <RiskRibbon alloc={alloc} goal={portfolio.goal} />
        </div>

        {/* Holdings table */}
        <HoldingsTable
          holdings={enriched}
          totalValue={totalValue}
          onAddHolding={() => setAddOpen(true)}
          onRemoveHolding={removeHolding}
          onEditHolding={setEditHoldingId}
        />

        {/* Stress test */}
        <div id="stress-test">
          <StressTest
            alloc={alloc}
            totalValue={totalValue}
            onSeeReceipt={handleSeeReceiptFromStress}
          />
        </div>

        {/* Optimization Lab — MPT recommended portfolio + Monte Carlo projection */}
        <ProjectionLab holdings={enriched} totalValue={totalValue} />

        {/* Data Inspector */}
        <DataInspector initialTickers={symbols.length ? symbols : ['VTI', 'BND', 'GLD']} />

        {/* Footer note */}
        <div className="text-center pt-6 text-[11px] text-ink-3 max-w-[640px] mx-auto leading-relaxed">
          Northstar is a portfolio analysis tool, not financial advice. Live prices via Yahoo Finance — typically 15-minute delayed for free tier.
          All math is open in the receipt; nothing is hidden.
        </div>
      </main>

      {/* Modals + drawers */}
      <AddHoldingModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAddSingle} />
      <GoalEditor open={goalOpen} initial={portfolio.goal} onClose={() => setGoalOpen(false)} onSave={handleSaveGoal} />
      <ReceiptDrawer
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        holdings={enriched}
        totalValue={totalValue}
        alloc={alloc}
        goal={portfolio.goal}
        scenarioConfig={activeScenario}
      />
      {/* Edit holding — uses AddHoldingModal-style inline edit. Simple version: pre-fill via prompt for now. */}
      {editingHolding && (
        <EditHoldingModal
          holding={editingHolding}
          onClose={() => setEditHoldingId(null)}
          onSave={patch => {
            updateHolding(editingHolding.id, patch);
            setEditHoldingId(null);
          }}
        />
      )}
    </div>
  );
}

// ── Inline edit modal ────────────────────────────────────────────────────
// Kept inline because it's a small derivative of AddHoldingModal — ticker is
// locked, only shares / purchase date / cost basis are editable.

function EditHoldingModal({
  holding,
  onClose,
  onSave,
}: {
  holding: Holding;
  onClose: () => void;
  onSave: (patch: Partial<Holding>) => void;
}) {
  const [shares, setShares] = useState(String(holding.shares));
  const [purchasedAt, setPurchasedAt] = useState(holding.purchasedAt ?? '');
  const [costBasis, setCostBasis] = useState(holding.costBasis != null ? String(holding.costBasis) : '');
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    const sh = Number(shares);
    if (!isFinite(sh) || sh <= 0) { setError('Shares must be positive.'); return; }
    const cost = costBasis.trim() ? Number(costBasis) : undefined;
    if (cost != null && (!isFinite(cost) || cost < 0)) { setError('Cost basis must be zero or positive.'); return; }
    onSave({
      shares: sh,
      purchasedAt: purchasedAt || undefined,
      costBasis: cost,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="relative bg-card border border-line rounded-card shadow-lg w-[440px] max-w-[92vw] p-8 z-50"
      >
        <div className="eyebrow">Edit holding</div>
        <h2 className="font-serif text-[26px] leading-tight mt-2 mb-1">
          <span className="font-mono not-italic">{holding.symbol}</span>
        </h2>
        <p className="text-[12px] text-ink-3 mb-6">{holding.name ?? 'Holding'}</p>

        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-2">
            <span className="eyebrow block mb-1.5">Shares</span>
            <input
              type="number" inputMode="decimal" step="any" min="0"
              value={shares}
              onChange={e => setShares(e.target.value)}
              autoFocus
              className="w-full font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
          <label className="col-span-1">
            <span className="eyebrow block mb-1.5">Purchase date</span>
            <input
              type="date"
              value={purchasedAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setPurchasedAt(e.target.value)}
              className="w-full font-mono text-[13px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
          <label className="col-span-1">
            <span className="eyebrow block mb-1.5">Cost / share</span>
            <input
              type="number" inputMode="decimal" step="any" min="0"
              value={costBasis}
              onChange={e => setCostBasis(e.target.value)}
              placeholder="optional"
              className="w-full font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 rounded-md bg-terra/10 border border-terra/30 text-terra text-[12px]">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3 mt-7">
          <button onClick={onClose} className="px-4 py-2.5 text-[13px] text-ink-2 hover:text-ink transition">Cancel</button>
          <button onClick={handleSave} className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
