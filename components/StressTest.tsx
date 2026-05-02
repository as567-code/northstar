'use client';

import { useState, useMemo } from 'react';
import type { AllocationMap } from '@/lib/types';
import { runScenario, fmtUSDFull, type ScenarioConfig } from '@/lib/sim';

interface Props {
  alloc: AllocationMap;
  totalValue: number;
  monthlyContribution?: number;
  onSeeReceipt: (config: ScenarioConfig) => void;
}

const DEFAULT_CONFIG: ScenarioConfig = {
  marketShock: { on: true,  dropPct: 0.25 },
  withdrawal:  { on: false, amount: 15000 },
  inflation:   { on: false, ratePct: 5,  years: 3 },
  rateShock:   { on: false, bps: 150 },
  incomeShock: { on: false, monthlyExpense: 3500, months: 6 },
};

const PRESETS: Record<string, ScenarioConfig> = {
  '2008 Crisis':    { marketShock: { on: true,  dropPct: 0.51 }, inflation: { on: true,  ratePct: 4, years: 3 }, withdrawal: { on: false, amount: 15000 }, rateShock: { on: false, bps: 150 }, incomeShock: { on: false, monthlyExpense: 3500, months: 6 } },
  'COVID Crash':    { marketShock: { on: true,  dropPct: 0.34 }, inflation: { on: false, ratePct: 5, years: 3 }, withdrawal: { on: false, amount: 15000 }, rateShock: { on: false, bps: 150 }, incomeShock: { on: false, monthlyExpense: 3500, months: 6 } },
  '2022 Rate Shock':{ marketShock: { on: true,  dropPct: 0.19 }, rateShock:  { on: true,  bps: 425 },             withdrawal: { on: false, amount: 15000 }, inflation: { on: false, ratePct: 5, years: 3 }, incomeShock: { on: false, monthlyExpense: 3500, months: 6 } },
  'Stagflation':    { marketShock: { on: true,  dropPct: 0.20 }, inflation:  { on: true,  ratePct: 8, years: 3 },  rateShock:  { on: true,  bps: 200 },             withdrawal: { on: false, amount: 15000 }, incomeShock: { on: false, monthlyExpense: 3500, months: 6 } },
};

const SHOCK_LABELS: Record<keyof ScenarioConfig, string> = {
  marketShock: 'Market shock',
  withdrawal:  'Withdrawal',
  inflation:   'Inflation erosion',
  rateShock:   'Rate hike',
  incomeShock: 'Income loss',
};

export default function StressTest({ alloc, totalValue, monthlyContribution = 1000, onSeeReceipt }: Props) {
  const [config, setConfig] = useState<ScenarioConfig>(DEFAULT_CONFIG);

  const result = useMemo(() => runScenario(alloc, totalValue, config), [alloc, totalValue, config]);

  // Sort contributions for the breakdown bar.
  const contribOrder = (Object.entries(result.contributions) as [keyof ScenarioConfig, number][])
    .filter(([_, v]) => v > 0.01)
    .sort((a, b) => b[1] - a[1]);
  const totalContrib = contribOrder.reduce((s, [_, v]) => s + v, 0);

  const recoveryMonths = monthlyContribution > 0 && result.totalLoss > 0
    ? Math.round(result.totalLoss / monthlyContribution)
    : null;

  function update<K extends keyof ScenarioConfig>(key: K, patch: Partial<NonNullable<ScenarioConfig[K]>>) {
    setConfig(c => ({
      ...c,
      [key]: { ...(c[key] ?? {}), ...patch },
    } as ScenarioConfig));
  }
  function toggle(key: keyof ScenarioConfig) {
    setConfig(c => ({
      ...c,
      [key]: { ...(c[key] ?? {}), on: !(c[key]?.on ?? false) },
    } as ScenarioConfig));
  }

  return (
    <section className="bg-card border border-line rounded-card overflow-hidden">
      <div className="px-8 pt-8 pb-6 border-b border-line">
        <div className="eyebrow mb-3">What-if lab</div>
        <h2 className="font-serif text-[32px] leading-tight">What's the worst that could happen?</h2>
        <p className="text-ink-2 mt-2 max-w-[640px]">
          Toggle the shocks you want to stress-test. The numbers update against your real portfolio.
        </p>

        <div className="flex flex-wrap gap-2 mt-5">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button
              key={name}
              onClick={() => setConfig(preset)}
              className="px-3 py-1.5 rounded-full text-[12px] border border-line hover:bg-paper transition"
            >
              {name}
            </button>
          ))}
          <button
            onClick={() => setConfig({
              marketShock: { on: false, dropPct: 0.25 },
              withdrawal:  { on: false, amount: 15000 },
              inflation:   { on: false, ratePct: 5, years: 3 },
              rateShock:   { on: false, bps: 150 },
              incomeShock: { on: false, monthlyExpense: 3500, months: 6 },
            })}
            className="px-3 py-1.5 rounded-full text-[12px] text-ink-3 hover:text-ink hover:bg-paper transition"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-0">
        {/* Toggles column */}
        <div className="p-8 space-y-5 border-r border-line">
          <ToggleRow on={config.marketShock?.on ?? false} onToggle={() => toggle('marketShock')} label="Stocks fall by">
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range" min={5} max={60} step={1}
                value={Math.round((config.marketShock?.dropPct ?? 0.25) * 100)}
                onChange={e => update('marketShock', { dropPct: Number(e.target.value) / 100 })}
                disabled={!config.marketShock?.on}
                className="flex-1 disabled:opacity-30"
              />
              <span className="font-mono text-[14px] text-terra w-12 text-right">
                {Math.round((config.marketShock?.dropPct ?? 0.25) * 100)}%
              </span>
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5">A typical bad year. 2008 was −51%. COVID was −34%.</p>
          </ToggleRow>

          <ToggleRow on={config.withdrawal?.on ?? false} onToggle={() => toggle('withdrawal')} label="I withdraw">
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-[13px] text-ink-3">$</span>
              <input
                type="number" min={1000} step={1000}
                value={config.withdrawal?.amount ?? 15000}
                onChange={e => update('withdrawal', { amount: Number(e.target.value) })}
                disabled={!config.withdrawal?.on}
                className="w-28 font-mono text-[14px] px-2 py-1 bg-paper border border-line rounded-md disabled:opacity-30"
              />
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5">Money you need first should be the safest.</p>
          </ToggleRow>

          <ToggleRow on={config.inflation?.on ?? false} onToggle={() => toggle('inflation')} label="Inflation runs at">
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range" min={2} max={12} step={0.5}
                value={config.inflation?.ratePct ?? 5}
                onChange={e => update('inflation', { ratePct: Number(e.target.value) })}
                disabled={!config.inflation?.on}
                className="flex-1 disabled:opacity-30"
              />
              <span className="font-mono text-[14px] text-gold w-12 text-right">
                {(config.inflation?.ratePct ?? 5).toFixed(1)}%
              </span>
              <span className="text-[12px] text-ink-3">for</span>
              <input
                type="number" min={1} max={10}
                value={config.inflation?.years ?? 3}
                onChange={e => update('inflation', { years: Number(e.target.value) })}
                disabled={!config.inflation?.on}
                className="w-12 font-mono text-[13px] px-1.5 py-1 bg-paper border border-line rounded-md disabled:opacity-30"
              />
              <span className="text-[12px] text-ink-3">yrs</span>
            </div>
          </ToggleRow>

          <ToggleRow on={config.rateShock?.on ?? false} onToggle={() => toggle('rateShock')} label="Fed raises rates by">
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range" min={25} max={500} step={25}
                value={config.rateShock?.bps ?? 150}
                onChange={e => update('rateShock', { bps: Number(e.target.value) })}
                disabled={!config.rateShock?.on}
                className="flex-1 disabled:opacity-30"
              />
              <span className="font-mono text-[14px] text-ink w-16 text-right">
                +{config.rateShock?.bps ?? 150} bps
              </span>
            </div>
          </ToggleRow>

          <ToggleRow on={config.incomeShock?.on ?? false} onToggle={() => toggle('incomeShock')} label="I lose my job for">
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number" min={1} max={24}
                value={config.incomeShock?.months ?? 6}
                onChange={e => update('incomeShock', { months: Number(e.target.value) })}
                disabled={!config.incomeShock?.on}
                className="w-14 font-mono text-[13px] px-1.5 py-1 bg-paper border border-line rounded-md disabled:opacity-30"
              />
              <span className="text-[12px] text-ink-3">months · spending</span>
              <span className="font-mono text-[13px] text-ink-3">$</span>
              <input
                type="number" min={500} step={250}
                value={config.incomeShock?.monthlyExpense ?? 3500}
                onChange={e => update('incomeShock', { monthlyExpense: Number(e.target.value) })}
                disabled={!config.incomeShock?.on}
                className="w-20 font-mono text-[13px] px-1.5 py-1 bg-paper border border-line rounded-md disabled:opacity-30"
              />
              <span className="text-[12px] text-ink-3">/mo</span>
            </div>
          </ToggleRow>
        </div>

        {/* Result column */}
        <div className="p-8 bg-paper/40">
          <div className="text-[11px] uppercase tracking-eyebrow text-ink-3 mb-2">Result</div>
          <p className="font-serif italic text-[16px] text-ink-2 leading-snug mb-3">
            Your {fmtUSDFull(totalValue)} portfolio in this scenario:
          </p>
          <div className="font-mono text-[56px] leading-none tracking-tight" style={{ color: result.totalLoss > 0 ? '#B85A3E' : '#2F5D3F' }}>
            {fmtUSDFull(result.endValue)}
          </div>
          <div className="font-mono text-[13px] text-ink-2 mt-2">
            {result.totalLoss > 0
              ? <>▼ −{fmtUSDFull(result.totalLoss)} paper loss · {result.totalLossPct.toFixed(1)}% drawdown</>
              : <>No active shocks. Toggle one to see impact.</>
            }
          </div>

          {contribOrder.length > 0 && (
            <div className="mt-7 pt-6 border-t border-line">
              <div className="text-[11px] uppercase tracking-eyebrow text-ink-3 mb-3">Loss attribution</div>
              <div className="space-y-2">
                {contribOrder.map(([key, v]) => {
                  const pct = totalContrib > 0 ? (v / totalContrib) * 100 : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="text-[12px] w-32 text-ink-2">{SHOCK_LABELS[key]}</div>
                      <div className="flex-1 h-1.5 bg-paper rounded-full overflow-hidden">
                        <div className="h-full bg-terra/70 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="font-mono text-[12px] text-ink w-24 text-right">−{fmtUSDFull(v)}</div>
                      <div className="font-mono text-[11px] text-ink-3 w-10 text-right">{Math.round(pct)}%</div>
                    </div>
                  );
                })}
              </div>
              {recoveryMonths != null && recoveryMonths > 0 && (
                <p className="text-[12px] text-ink-2 mt-4">
                  Recovery horizon: <strong className="font-mono text-ink">~{recoveryMonths} months</strong> at your current ${monthlyContribution}/mo contribution rate.
                </p>
              )}
              <button
                onClick={() => onSeeReceipt(config)}
                className="mt-5 px-5 py-3 rounded-full bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition"
              >
                See how to protect against this →
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ToggleRow({ on, onToggle, label, children }: { on: boolean; onToggle: () => void; label: string; children: React.ReactNode }) {
  return (
    <div className={`pb-4 border-b border-line last:border-0 transition-opacity ${on ? '' : 'opacity-60'}`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-3 group"
        aria-pressed={on}
      >
        <span className={`w-4 h-4 rounded border ${on ? 'bg-ink border-ink' : 'border-line group-hover:border-ink'} flex items-center justify-center transition`}>
          {on && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5 L4.5 7.5 L8 3" stroke="#F4EFE6" strokeWidth="1.5" />
            </svg>
          )}
        </span>
        <span className="text-[14px] text-ink">{label}</span>
      </button>
      {children}
    </div>
  );
}
