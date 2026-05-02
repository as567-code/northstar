'use client';

import type { AllocationMap, Goal } from '@/lib/types';
import { calcRiskScore } from '@/lib/sim';

interface Props {
  alloc: AllocationMap;
  goal: Goal | null;
}

const SEGMENTS = [
  { label: 'Very safe', max: 1.5,  color: '#8AA17F' },
  { label: 'Safe',      max: 2.5,  color: '#8AA17F' },
  { label: 'Balanced',  max: 3.5,  color: '#C8973A' },
  { label: 'Risky',     max: 4.3,  color: '#B85A3E' },
  { label: 'Very risky',max: 5.01, color: '#B85A3E' },
];

function lossEstimateForScore(score: number): string {
  // Rough mapping: typical down-year loss for a portfolio of this risk.
  if (score < 1.5) return '0–4%';
  if (score < 2.5) return '4–8%';
  if (score < 3.5) return '8–14%';
  if (score < 4.3) return '15–22%';
  return '20–35%';
}

export default function RiskRibbon({ alloc, goal }: Props) {
  const score = calcRiskScore(alloc);
  const dotPct = Math.min(100, Math.max(0, (score / 5) * 100));
  const lossEstimate = lossEstimateForScore(score);

  return (
    <div className="bg-card border border-line rounded-card p-7">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-serif text-[24px]">How risky is this?</h2>
        <span className="eyebrow">Risk profile</span>
      </div>

      <div className="relative h-3 rounded-full overflow-hidden flex">
        {SEGMENTS.map((s, i) => (
          <div key={i} className="flex-1 h-full" style={{ background: s.color, opacity: 0.35 }} />
        ))}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-ink border-[3px] border-paper shadow-sm"
          style={{ left: `calc(${dotPct}% - 8px)` }}
        />
      </div>
      <div className="grid grid-cols-5 mt-2 text-[10px] uppercase tracking-smallcap text-ink-3">
        {SEGMENTS.map((s, i) => (
          <div key={i} className="text-center">{s.label}</div>
        ))}
      </div>

      <p className="mt-5 text-[13px] text-ink-2 leading-relaxed">
        Your portfolio scores <strong className="font-mono text-ink">{score.toFixed(1)} / 5</strong>. Said plainly: in a typical bad year, expect a paper loss around <strong>{lossEstimate}</strong>.
        {goal && goal.horizonYears < 5 && score > 3.5 ? (
          <> With only {goal.horizonYears} years to go, that's a real risk — there isn't much time to recover.</>
        ) : goal && goal.horizonYears >= 10 ? (
          <> Don't sell when that happens — that's the price of admission for {goal.horizonYears}-year compounding.</>
        ) : (
          <> Plan for it before it happens, not during.</>
        )}
      </p>
    </div>
  );
}
