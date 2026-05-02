// Persistence layer. localStorage-only (production-grade for solo use).
// Exposes a useReducer-shaped hook that components consume.

'use client';

import { useEffect, useReducer, useCallback } from 'react';
import type { Holding, Portfolio, Goal } from './types';
import { SCHEMA_VERSION } from './types';

const STORAGE_KEY = 'northstar.portfolio.v1';

const EMPTY_PORTFOLIO: Portfolio = {
  holdings: [],
  goal: null,
  schemaVersion: SCHEMA_VERSION,
};

// ── Actions ──────────────────────────────────────────────────────────────

type Action =
  | { type: 'load'; portfolio: Portfolio }
  | { type: 'addHolding'; holding: Holding }
  | { type: 'updateHolding'; id: string; patch: Partial<Holding> }
  | { type: 'removeHolding'; id: string }
  | { type: 'setGoal'; goal: Goal | null }
  | { type: 'reset' };

function reducer(state: Portfolio, action: Action): Portfolio {
  switch (action.type) {
    case 'load':
      return action.portfolio;
    case 'addHolding':
      // De-dupe by symbol — adding an existing symbol stacks shares onto it.
      {
        const existing = state.holdings.find(h => h.symbol === action.holding.symbol);
        if (existing) {
          return {
            ...state,
            holdings: state.holdings.map(h =>
              h.id === existing.id
                ? { ...h, shares: h.shares + action.holding.shares }
                : h
            ),
          };
        }
        return { ...state, holdings: [...state.holdings, action.holding] };
      }
    case 'updateHolding':
      return {
        ...state,
        holdings: state.holdings.map(h =>
          h.id === action.id ? { ...h, ...action.patch } : h
        ),
      };
    case 'removeHolding':
      return { ...state, holdings: state.holdings.filter(h => h.id !== action.id) };
    case 'setGoal':
      return { ...state, goal: action.goal };
    case 'reset':
      return EMPTY_PORTFOLIO;
    default:
      return state;
  }
}

// ── Persistence ──────────────────────────────────────────────────────────

function loadFromStorage(): Portfolio {
  if (typeof window === 'undefined') return EMPTY_PORTFOLIO;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PORTFOLIO;
    const parsed = JSON.parse(raw) as Portfolio;
    // Schema migration: if version is older than current, migrate or discard.
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      // For v1, just discard any older format.
      return EMPTY_PORTFOLIO;
    }
    // Defensive: ensure required arrays exist.
    return {
      schemaVersion: SCHEMA_VERSION,
      holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
      goal: parsed.goal ?? null,
    };
  } catch {
    return EMPTY_PORTFOLIO;
  }
}

function saveToStorage(portfolio: Portfolio): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
  } catch {
    // Ignore quota errors — non-fatal.
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UsePortfolioResult {
  portfolio: Portfolio;
  hydrated: boolean;
  addHolding: (h: Holding) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  removeHolding: (id: string) => void;
  setGoal: (goal: Goal | null) => void;
  reset: () => void;
}

export function usePortfolio(): UsePortfolioResult {
  const [portfolio, dispatch] = useReducer(reducer, EMPTY_PORTFOLIO);
  // We track hydration separately so SSR-rendered <html> doesn't differ from
  // post-mount client state.
  const [hydrated, setHydrated] = useReducer(() => true, false);

  // Load on mount.
  useEffect(() => {
    const loaded = loadFromStorage();
    dispatch({ type: 'load', portfolio: loaded });
    setHydrated();
  }, []);

  // Save on every change after hydration.
  useEffect(() => {
    if (hydrated) saveToStorage(portfolio);
  }, [portfolio, hydrated]);

  const addHolding    = useCallback((h: Holding) => dispatch({ type: 'addHolding', holding: h }), []);
  const updateHolding = useCallback((id: string, patch: Partial<Holding>) =>
    dispatch({ type: 'updateHolding', id, patch }), []);
  const removeHolding = useCallback((id: string) => dispatch({ type: 'removeHolding', id }), []);
  const setGoal       = useCallback((goal: Goal | null) => dispatch({ type: 'setGoal', goal }), []);
  const reset         = useCallback(() => dispatch({ type: 'reset' }), []);

  return { portfolio, hydrated, addHolding, updateHolding, removeHolding, setGoal, reset };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Generate a stable client-side ID for a new holding. */
export function newHoldingId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
