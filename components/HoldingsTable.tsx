'use client';

import { useState } from 'react';
import type { EnrichedHolding } from '@/lib/types';
import { fmtUSDFull, fmtPct } from '@/lib/sim';
import { assetClassColor, assetClassLabel, securityTypeLabel } from '@/lib/ticker-classifier';

interface Props {
  holdings: EnrichedHolding[];
  totalValue: number;
  onAddHolding: () => void;
  onRemoveHolding: (id: string) => void;
  onEditHolding: (id: string) => void;
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 2 L11 4 L4 11 L1.5 11.5 L2 9 Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3.5 L11 3.5 M5 6 L5 10 M8 6 L8 10 M3 3.5 L3.5 11 L9.5 11 L10 3.5 M5 3.5 L5 2 L8 2 L8 3.5" />
    </svg>
  );
}

export default function HoldingsTable({ holdings, totalValue, onAddHolding, onRemoveHolding, onEditHolding }: Props) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  if (holdings.length === 0) return null;

  return (
    <div className="bg-card border border-line rounded-card overflow-hidden">
      <div className="px-7 pt-6 pb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-[24px]">Holdings</h2>
        <span className="eyebrow">{holdings.length} position{holdings.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-smallcap text-ink-3 border-y border-line">
              <th className="text-left font-medium py-2.5 pl-7">Ticker</th>
              <th className="text-left font-medium py-2.5">Class</th>
              <th className="text-right font-medium py-2.5">Shares</th>
              <th className="text-right font-medium py-2.5">Price</th>
              <th className="text-right font-medium py-2.5">Value</th>
              <th className="text-right font-medium py-2.5">Day</th>
              <th className="text-right font-medium py-2.5 pr-7">YTD</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr
                key={h.id}
                onMouseEnter={() => setHoveredRow(h.id)}
                onMouseLeave={() => setHoveredRow(null)}
                className="border-b border-line last:border-0 hover:bg-paper/60 transition"
              >
                <td className="py-3 pl-7">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[14px] font-medium text-ink">{h.symbol}</span>
                    <span className="text-[9px] uppercase tracking-smallcap text-ink-3 px-1.5 py-0.5 border border-line rounded">
                      {securityTypeLabel(h.securityType)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-3 mt-0.5">{h.name ?? '—'}</div>
                </td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: assetClassColor(h.assetClass) }} />
                    {assetClassLabel(h.assetClass)}
                  </span>
                </td>
                <td className="py-3 text-right font-mono text-[13px] text-ink-2">{h.shares}</td>
                <td className="py-3 text-right font-mono text-[13px]">
                  {h.price != null ? `$${h.price.toFixed(2)}` : <span className="text-ink-3">—</span>}
                </td>
                <td className="py-3 text-right font-mono text-[13px]">{fmtUSDFull(h.value)}</td>
                <td className="py-3 text-right font-mono text-[12px]" style={{ color: (h.dayChangePct ?? 0) >= 0 ? '#2F5D3F' : '#B85A3E' }}>
                  {h.dayChangePct != null ? fmtPct(h.dayChangePct, 2) : <span className="text-ink-3">—</span>}
                </td>
                <td className="py-3 text-right pr-7 font-mono text-[12px] relative" style={{ color: (h.ytdChangePct ?? 0) >= 0 ? '#2F5D3F' : '#B85A3E' }}>
                  {h.ytdChangePct != null ? fmtPct(h.ytdChangePct) : <span className="text-ink-3">—</span>}
                  {hoveredRow === h.id && (
                    <span className="absolute right-7 top-1/2 -translate-y-1/2 flex gap-1 bg-card border border-line rounded-full px-1 py-0.5">
                      <button
                        onClick={() => onEditHolding(h.id)}
                        className="w-6 h-6 flex items-center justify-center text-ink-2 hover:text-ink hover:bg-paper rounded-full transition"
                        title="Edit"
                        aria-label="Edit holding"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${h.symbol}?`)) onRemoveHolding(h.id);
                        }}
                        className="w-6 h-6 flex items-center justify-center text-ink-2 hover:text-terra hover:bg-paper rounded-full transition"
                        title="Remove"
                        aria-label="Remove holding"
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-paper/60">
              <td className="py-3.5 pl-7 text-[10px] uppercase tracking-smallcap text-ink-3" colSpan={4}>Total</td>
              <td className="py-3.5 text-right font-mono text-[14px] font-medium">{fmtUSDFull(totalValue)}</td>
              <td colSpan={2} className="pr-7"/>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="border-t border-line">
        <button
          onClick={onAddHolding}
          className="w-full py-3.5 text-[13px] text-ink-2 hover:text-ink hover:bg-paper/40 transition"
        >
          + Add holding
        </button>
      </div>
    </div>
  );
}
