import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Northstar editorial palette
        paper:        '#F4EFE6',
        card:         '#FBF8F1',
        ink:          '#0E1B2C',
        'ink-2':      '#4B5567',
        'ink-3':      '#8B92A1',
        line:         'rgba(14,27,44,0.10)',
        'line-strong':'rgba(14,27,44,0.18)',

        // Asset-class accents
        forest:   '#2F5D3F',  // stocks / positive
        terra:    '#B85A3E',  // negative / drift / risk
        gold:     '#C8973A',  // gold asset class / caution
        'gold-d': '#9A7327',  // gold hover/border
        sage:     '#8AA17F',  // secondary positive
        slate:    '#4B5567',  // bonds asset class
      },
      fontFamily: {
        serif: ['var(--font-instrument)', 'Georgia', 'serif'],
        sans:  ['var(--font-inter-tight)', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        eyebrow: '0.22em',
        smallcap: '0.15em',
      },
      borderRadius: {
        card: '18px',
        chip: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
