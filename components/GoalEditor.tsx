'use client';

import { useState, useEffect } from 'react';
import type { Goal, RiskProfile } from '@/lib/types';
import { riskProfileFromHorizon } from '@/lib/types';

interface Props {
  open: boolean;
  initial: Goal | null;
  onClose: () => void;
  onSave: (goal: Goal | null) => void;
}

export default function GoalEditor({ open, initial, onClose, onSave }: Props) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [target, setTarget] = useState(initial?.target ? String(initial.target) : '');
  const [horizon, setHorizon] = useState(initial?.horizonYears ? String(initial.horizonYears) : '');
  const [profile, setProfile] = useState<RiskProfile | null>(initial?.riskProfile ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? '');
      setTarget(initial?.target ? String(initial.target) : '');
      setHorizon(initial?.horizonYears ? String(initial.horizonYears) : '');
      setProfile(initial?.riskProfile ?? null);
      setError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  // Auto-suggest profile from horizon when not user-overridden.
  const suggestedProfile = horizon ? riskProfileFromHorizon(Number(horizon)) : 'Balanced';
  const effectiveProfile = profile ?? suggestedProfile;

  if (!open) return null;

  function handleSave() {
    setError(null);
    const t = Number(target);
    const h = Number(horizon);
    if (!label.trim()) { setError('Give your goal a label.'); return; }
    if (!isFinite(t) || t <= 0) { setError('Target amount must be positive.'); return; }
    if (!isFinite(h) || h <= 0) { setError('Horizon must be at least 1 year.'); return; }
    const goal: Goal = {
      label: label.trim(),
      target: t,
      horizonYears: h,
      riskProfile: effectiveProfile,
    };
    onSave(goal);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="relative bg-card border border-line rounded-card shadow-lg w-[520px] max-w-[92vw] p-8 z-50"
      >
        <div className="eyebrow">{initial ? 'Edit goal' : 'Set a goal'}</div>
        <h2 className="font-serif text-[28px] leading-tight mt-2 mb-2">
          What are you <em className="italic">saving for</em>?
        </h2>
        <p className="text-[13px] text-ink-2 mb-6">
          A goal lets us tailor risk advice and stress-tests to your timeline. You can change or remove it any time.
        </p>

        <div className="space-y-5">
          <label className="block">
            <span className="eyebrow block mb-1.5">Goal</span>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="House down payment"
              autoFocus
              className="w-full text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="eyebrow block mb-1.5">Target amount</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[15px] text-ink-3">$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="250,000"
                  className="flex-1 font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
                />
              </div>
            </label>
            <label>
              <span className="eyebrow block mb-1.5">When you need it</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="50"
                  value={horizon}
                  onChange={e => setHorizon(e.target.value)}
                  placeholder="4"
                  className="flex-1 font-mono text-[15px] px-3 py-2.5 bg-paper border border-line rounded-md focus:outline-none focus:border-ink transition"
                />
                <span className="font-mono text-[13px] text-ink-3">years</span>
              </div>
            </label>
          </div>

          <div>
            <span className="eyebrow block mb-2">Risk tolerance</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Cautious', 'Balanced', 'Growth'] as const).map(p => {
                const isSelected = effectiveProfile === p;
                const isSuggested = profile == null && suggestedProfile === p;
                return (
                  <button
                    key={p}
                    onClick={() => setProfile(p)}
                    className={`py-2.5 rounded-md text-[13px] border transition ${
                      isSelected ? 'border-ink bg-ink text-paper' : 'border-line hover:bg-paper'
                    }`}
                  >
                    {p}{isSuggested && <span className="ml-1 text-[10px] opacity-60">(suggested)</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-3 mt-2">
              {horizon ? (
                <>For a {horizon}-year horizon, we suggest <strong>{suggestedProfile}</strong>. Override if you know what you want.</>
              ) : (
                <>We'll suggest a profile once you fill in your horizon.</>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 rounded-md bg-terra/10 border border-terra/30 text-terra text-[12px]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-7">
          {initial ? (
            <button
              onClick={() => {
                if (confirm('Remove this goal?')) {
                  onSave(null);
                  onClose();
                }
              }}
              className="text-[13px] text-terra hover:opacity-70 transition"
            >
              Remove goal
            </button>
          ) : <div />}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-[13px] text-ink-2 hover:text-ink transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition"
            >
              {initial ? 'Update goal' : 'Save goal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
