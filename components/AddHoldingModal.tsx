'use client';

import { useState, useEffect } from 'react';
import type { Holding } from '@/lib/types';
import { classifyTicker } from '@/lib/ticker-classifier';
import { newHoldingId } from '@/lib/portfolio-store';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (holding: Holding) => void;
}

export default function AddHoldingModal({ open, onClose, onAdd }: Props) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset on close.
      setSymbol(''); setShares(''); setPurchasedAt(''); setCostBasis('');
      setError(null); setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit() {
    setError(null);
    const sym = symbol.trim().toUpperCase();
    const shareCount = Number(shares);
    if (!sym) { setError('Ticker symbol is required.'); return; }
    if (!isFinite(shareCount) || shareCount <= 0) { setError('Shares must be a positive number.'); return; }

    const cls = classifyTicker(sym);
    const cost = costBasis.trim() ? Number(costBasis) : undefined;
    if (cost != null && (!isFinite(cost) || cost < 0)) {
      setError('Cost basis must be zero or positive.'); return;
    }

    const h: Holding = {
      id: newHoldingId(),
      symbol: sym,
      name: cls.name,
      shares: shareCount,
      purchasedAt: purchasedAt || undefined,
      costBasis: cost,
      assetClass: cls.assetClass,
      securityType: cls.securityType,
    };
    setSubmitting(true);
    onAdd(h);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="relative bg-card border border-line rounded-card shadow-lg w-[480px] max-w-[92vw] p-8 z-50"
      >
        <div className="eyebrow">Add holding</div>
        <h2 className="font-serif text-[28px] leading-tight mt-2 mb-1">
          What did you <em className="italic">buy</em>?
        </h2>
        <p className="text-[13px] text-ink-2 mb-6">
          We'll fetch the live price and figure out the rest. Purchase date is optional but unlocks total return.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-1">
            <span className="eyebrow block mb-1.5">Ticker</span>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              autoFocus
              autoCapitalize="characters"
              placeholder="VTI"
              className="w-full font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
          <label className="col-span-1">
            <span className="eyebrow block mb-1.5">Shares</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="45"
              className="w-full font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
          <label className="col-span-1">
            <span className="eyebrow block mb-1.5">Purchase date <span className="text-ink-3 normal-case tracking-normal text-[10px]">(optional)</span></span>
            <input
              type="date"
              value={purchasedAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setPurchasedAt(e.target.value)}
              className="w-full font-mono text-[13px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
          <label className="col-span-1">
            <span className="eyebrow block mb-1.5">Cost / share <span className="text-ink-3 normal-case tracking-normal text-[10px]">(optional)</span></span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={costBasis}
              onChange={e => setCostBasis(e.target.value)}
              placeholder="221.50"
              className="w-full font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 rounded-md bg-terra/10 border border-terra/30 text-terra text-[12px]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-7">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] text-ink-2 hover:text-ink transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            Add holding
          </button>
        </div>
      </div>
    </div>
  );
}
