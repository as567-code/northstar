'use client';

import type { Goal, AllocationMap } from '@/lib/types';
import { fmtUSDFull, healthScore, healthLabel, healthColor } from '@/lib/sim';

interface Props {
  totalValue: number;
  alloc: AllocationMap;
  goal: Goal | null;
  onSeeReceipt: () => void;
  onRunWhatIf: () => void;
}

function HealthGauge({ score, color }: { score: number; color: string }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="relative w-[200px] h-[200px] flex-shrink-0">
      <svg width="200" height="200" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(14,27,44,0.08)" strokeWidth="6" />
        <circle
          cx="100" cy="100" r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-serif italic text-[12px] text-ink-3 mb-0.5">health</div>
        <div className="font-mono text-[44px] leading-none tracking-tight" style={{ color }}>{score}</div>
        <div className="eyebrow mt-2" style={{ color }}>{healthLabel(score)}</div>
      </div>
    </div>
  );
}

function buildHeadline(totalValue: number, goal: Goal | null): { main: string; sub: string } {
  if (totalValue === 0) {
    return {
      main: 'Your portfolio is empty.',
      sub: 'Add a holding to start. We\'ll fetch live prices and show you everything else.',
    };
  }

  const valueStr = fmtUSDFull(totalValue);

  if (!goal) {
    return {
      main: `Your portfolio is worth ${valueStr}.`,
      sub: 'Set a goal to see how on-track you are and get tailored stress-tests.',
    };
  }

  const pct = Math.round((totalValue / goal.target) * 100);
  const main = `Your portfolio is worth ${valueStr} — about ${pct}% of your ${fmtUSDFull(goal.target)} target.`;

  let sub: string;
  if (goal.horizonYears <= 4) {
    sub = `With ${goal.horizonYears} year${goal.horizonYears === 1 ? '' : 's'} to go, the bigger risk is no longer growth. It's a market drop right before you need the money.`;
  } else if (goal.horizonYears <= 10) {
    sub = `With ${goal.horizonYears} years to go, you have time to absorb shocks. The question is whether your allocation matches that horizon.`;
  } else {
    sub = `With ${goal.horizonYears} years to go, your friend is compounding. Don't sell when the market falls — that's how compounding gets broken.`;
  }
  return { main, sub };
}

export default function Hero({ totalValue, alloc, goal, onSeeReceipt, onRunWhatIf }: Props) {
  const score = totalValue > 0 ? healthScore(alloc, goal) : 0;
  const color = healthColor(score);
  const { main, sub } = buildHeadline(totalValue, goal);

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <section className="relative max-w-[1280px] mx-auto px-12 mt-6 mb-12">
      <div className="eyebrow mb-5">Today's briefing · {today}</div>
      <div className="grid grid-cols-[1fr_auto] gap-12 items-center">
        <div>
          <h1 className="font-serif text-[44px] leading-[1.08] tracking-tight text-ink max-w-[760px]">
            {main}
          </h1>
          <p className="font-serif text-[20px] italic text-ink-2 leading-[1.45] mt-5 max-w-[640px]">
            {sub}
          </p>
          {totalValue > 0 && (
            <div className="flex items-center gap-3 mt-7">
              <button
                onClick={onSeeReceipt}
                className="px-5 py-3 rounded-full bg-ink text-paper text-[14px] font-medium hover:opacity-90 transition"
              >
                See full receipt →
              </button>
              <button
                onClick={onRunWhatIf}
                className="px-5 py-3 rounded-full border border-line text-[14px] hover:bg-card transition"
              >
                Run a what-if
              </button>
            </div>
          )}
        </div>
        {totalValue > 0 && <HealthGauge score={score} color={color} />}
      </div>
    </section>
  );
}
