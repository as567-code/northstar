'use client';

import type { AllocationMap, Goal, AssetClass } from '@/lib/types';
import { TARGET_ALLOCATIONS } from '@/lib/types';
import { assetClassColor, assetClassLabel } from '@/lib/ticker-classifier';

interface Props {
  alloc: AllocationMap;
  goal: Goal | null;
}

const ROW_KEYS: AssetClass[] = ['equity', 'bonds', 'gold', 'cash', 'other'];

export default function AllocationCard({ alloc, goal }: Props) {
  const profile = goal?.riskProfile ?? 'Balanced';
  const target = TARGET_ALLOCATIONS[profile];

  // Only show rows that have either current value or target value > 0.
  const visibleRows = ROW_KEYS.filter(k => (alloc[k] ?? 0) > 0.5 || target[k] > 0.5);

  const equityDrift = Math.round((alloc.equity ?? 0) - target.equity);

  return (
    <div className="bg-card border border-line rounded-card p-7">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-serif text-[24px]">Where your money sits</h2>
        <span className="eyebrow">Allocation</span>
      </div>
      <div className="space-y-5">
        {visibleRows.map(k => {
          const cur = Math.round(alloc[k] ?? 0);
          const tgt = target[k];
          const drift = cur - tgt;
          const showDrift = Math.abs(drift) >= 2;
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: assetClassColor(k) }} />
                  <span className="text-[14px]">{assetClassLabel(k)}</span>
                </div>
                <div className="font-mono text-[13px]">
                  <span className="text-ink">{cur}%</span>
                  <span className="text-ink-3"> / target {tgt}%</span>
                  {showDrift && (
                    <span className="ml-2" style={{ color: drift > 0 ? '#B85A3E' : '#2F5D3F' }}>
                      {drift > 0 ? '+' : ''}{drift}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-paper rounded-full overflow-hidden relative">
                <div className="h-full rounded-full transition-all" style={{ width: `${cur}%`, background: assetClassColor(k) }} />
                <div className="absolute top-0 bottom-0 w-px bg-ink/40" style={{ left: `${tgt}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 pt-5 border-t border-line text-[13px] text-ink-2 leading-relaxed">
        {!goal ? (
          <>Set a goal to see your target allocation. Without one, we're showing a Balanced default.</>
        ) : Math.abs(equityDrift) < 2 ? (
          <>Your allocation matches your <em className="font-serif">{profile}</em> profile. Nothing to fix.</>
        ) : equityDrift > 0 ? (
          <>Compared to your <em className="font-serif">{profile}</em> profile, you're carrying <strong>{equityDrift}% extra in stocks</strong>. That's typical after a strong year — markets push you off-target without you doing anything.</>
        ) : (
          <>Compared to your <em className="font-serif">{profile}</em> profile, you're <strong>{Math.abs(equityDrift)}% under in stocks</strong>. If your horizon supports more risk, this might be costing you growth.</>
        )}
      </div>
    </div>
  );
}
