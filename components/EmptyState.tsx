'use client';

import { useState } from 'react';
import type { Holding } from '@/lib/types';
import { classifyTicker } from '@/lib/ticker-classifier';
import { newHoldingId } from '@/lib/portfolio-store';

interface Props {
  onAdd: (holdings: Holding[]) => void;
  onAddSingle: (holding: Holding) => void;
}

export default function EmptyState({ onAdd, onAddSingle }: Props) {
  const [mode, setMode] = useState<'single' | 'paste'>('single');
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleAddSingle() {
    setError(null);
    const sym = symbol.trim().toUpperCase();
    const sh = Number(shares);
    if (!sym) { setError('Ticker required.'); return; }
    if (!isFinite(sh) || sh <= 0) { setError('Shares must be positive.'); return; }
    const cls = classifyTicker(sym);
    onAddSingle({
      id: newHoldingId(),
      symbol: sym,
      name: cls.name,
      shares: sh,
      assetClass: cls.assetClass,
      securityType: cls.securityType,
    });
    setSymbol(''); setShares('');
  }

  function handlePaste() {
    setError(null);
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed: Holding[] = [];
    const failures: string[] = [];
    for (const line of lines) {
      // Accept "VTI 45", "VTI,45", "VTI 45.5", or "VTI 45 100.00" (third token is cost basis).
      const parts = line.split(/[\s,]+/);
      const sym = (parts[0] ?? '').trim().toUpperCase();
      const sh = Number(parts[1]);
      const cost = parts[2] ? Number(parts[2]) : undefined;
      if (!sym || !isFinite(sh) || sh <= 0) {
        failures.push(line);
        continue;
      }
      const cls = classifyTicker(sym);
      parsed.push({
        id: newHoldingId(),
        symbol: sym,
        name: cls.name,
        shares: sh,
        costBasis: cost,
        assetClass: cls.assetClass,
        securityType: cls.securityType,
      });
    }
    if (parsed.length === 0) {
      setError('No valid rows. Use the format: TICKER SHARES (one per line).');
      return;
    }
    if (failures.length > 0) {
      setError(`Skipped ${failures.length} unreadable row${failures.length === 1 ? '' : 's'}: ${failures.slice(0, 3).join(', ')}`);
    }
    onAdd(parsed);
    setPasteText('');
  }

  return (
    <main className="max-w-[1280px] mx-auto px-12 py-16">
      <div className="eyebrow mb-5">Get started</div>
      <h1 className="font-serif text-[52px] leading-[1.05] tracking-tight max-w-[760px]">
        <em className="italic">Welcome.</em> Let's see what you own.
      </h1>
      <p className="font-serif italic text-[20px] text-ink-2 mt-5 max-w-[600px] leading-relaxed">
        Add a holding to start. We'll fetch live prices and show you everything else — allocation, risk, stress-tests, the math behind every number.
      </p>

      <div className="mt-10 max-w-[640px]">
        {mode === 'single' ? (
          <>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
              <input
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="VTI"
                autoFocus
                className="font-mono text-[16px] px-4 py-3 bg-card border border-line rounded-md focus:outline-none focus:border-ink transition"
                onKeyDown={e => { if (e.key === 'Enter') handleAddSingle(); }}
              />
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={shares}
                onChange={e => setShares(e.target.value)}
                placeholder="Shares"
                className="font-mono text-[16px] px-4 py-3 bg-card border border-line rounded-md focus:outline-none focus:border-ink transition"
                onKeyDown={e => { if (e.key === 'Enter') handleAddSingle(); }}
              />
              <button
                onClick={handleAddSingle}
                className="px-6 py-3 rounded-md bg-ink text-paper text-[14px] font-medium hover:opacity-90 transition"
              >
                Add
              </button>
            </div>
            <button
              onClick={() => { setMode('paste'); setError(null); }}
              className="mt-4 text-[13px] text-ink-2 hover:text-ink transition"
            >
              Don't know your shares? Paste a list →
            </button>
          </>
        ) : (
          <>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={`VTI 45\nQQQ 18\nBND 120\nGLD 8`}
              rows={6}
              className="w-full font-mono text-[14px] px-4 py-3 bg-card border border-line rounded-md focus:outline-none focus:border-ink transition resize-y"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handlePaste}
                className="px-5 py-2.5 rounded-md bg-ink text-paper text-[14px] font-medium hover:opacity-90 transition"
              >
                Import list
              </button>
              <button
                onClick={() => { setMode('single'); setError(null); setPasteText(''); }}
                className="px-5 py-2.5 text-[13px] text-ink-2 hover:text-ink transition"
              >
                Back to single
              </button>
              <span className="text-[11px] text-ink-3 ml-auto">Format: TICKER SHARES per line</span>
            </div>
          </>
        )}

        {error && (
          <div className="mt-4 px-3 py-2 rounded-md bg-terra/10 border border-terra/30 text-terra text-[12px]">
            {error}
          </div>
        )}
      </div>

      <div className="mt-20 grid grid-cols-3 gap-6 max-w-[1080px]">
        <SkelCard title="Allocation" />
        <SkelCard title="Risk profile" />
        <SkelCard title="Holdings" />
      </div>
    </main>
  );
}

function SkelCard({ title }: { title: string }) {
  return (
    <div className="bg-card border border-line rounded-card p-7 opacity-50">
      <div className="eyebrow mb-4">{title}</div>
      <div className="h-3 bg-line rounded mb-3" />
      <div className="h-3 bg-line rounded w-3/4 mb-3" />
      <div className="h-3 bg-line rounded w-1/2" />
      <div className="text-[11px] text-ink-3 italic mt-6">Add holdings to populate</div>
    </div>
  );
}
