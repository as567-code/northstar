'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  lastUpdated: number | null;
  onAddHolding: () => void;
  onEditGoal: () => void;
  onResetPortfolio: () => void;
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2 L12.4 9.6 L20 11 L12.4 12.4 L11 20 L9.6 12.4 L2 11 L9.6 9.6 Z" fill="#2F5D3F" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1 L8 3 M8 13 L8 15 M1 8 L3 8 M13 8 L15 8 M3 3 L4.5 4.5 M11.5 11.5 L13 13 M3 13 L4.5 11.5 M11.5 4.5 L13 3" />
    </svg>
  );
}

function relativeTime(ms: number | null): string {
  if (ms == null) return 'Never updated';
  const diff = Date.now() - ms;
  if (diff < 30_000) return 'Just now';
  if (diff < 60_000) return 'Less than a minute ago';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr} hr ago`;
}

export default function Header({ lastUpdated, onAddHolding, onEditGoal, onResetPortfolio }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  return (
    <header className="flex items-start justify-between max-w-[1280px] mx-auto px-12 pt-10 pb-2">
      <div>
        <div className="flex items-center gap-2.5">
          <StarIcon />
          <span className="font-serif italic text-[26px] leading-none">Northstar</span>
        </div>
        <div className="eyebrow mt-3">
          Portfolio · {lastUpdated ? `last updated ${relativeTime(lastUpdated)}` : 'no holdings yet'}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onAddHolding}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition"
        >
          + Add holding
        </button>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Settings"
            aria-expanded={menuOpen}
            className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink hover:bg-card transition"
          >
            <GearIcon />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 bg-card border border-line rounded-card shadow-sm py-2 w-[200px]">
              <button
                onClick={() => { onEditGoal(); setMenuOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-paper transition"
              >
                Edit goal
              </button>
              <button
                onClick={() => { setMenuOpen(false); /* export hook */ }}
                className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-paper transition"
                disabled
                title="Coming soon"
              >
                <span className="text-ink-3">Export portfolio</span>
              </button>
              <div className="h-px bg-line my-1" />
              <button
                onClick={() => {
                  if (confirm('Reset portfolio? This deletes all holdings and your goal.')) {
                    onResetPortfolio();
                    setMenuOpen(false);
                  }
                }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-terra hover:bg-paper transition"
              >
                Reset portfolio
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
