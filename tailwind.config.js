/** @type {import('tailwindcss').Config} */
// Colours map to CSS variables in src/index.css so a tenant theme ([data-theme]) swaps them without a rebuild (D25).
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        canvas: 'var(--color-canvas)',
        surface: { DEFAULT: 'var(--color-surface)', 2: 'var(--color-surface-2)' },
        border: { DEFAULT: 'var(--color-border)', strong: 'var(--color-border-strong)' },
        ink: { DEFAULT: 'var(--color-ink)', 2: 'var(--color-ink-2)' },
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        accent: {
          50: 'var(--color-accent-50)', 100: 'var(--color-accent-100)', 200: 'var(--color-accent-200)', 300: 'var(--color-accent-300)',
          500: 'var(--color-accent-500)', 600: 'var(--color-accent-600)', 700: 'var(--color-accent-700)', DEFAULT: 'var(--color-accent-500)', fg: 'var(--color-accent-fg)',
        },
        ok: { DEFAULT: 'var(--color-ok)', bg: 'var(--color-ok-bg)', fg: 'var(--color-ok-fg)', border: 'var(--color-ok-border)' },
        warn: { DEFAULT: 'var(--color-warn)', bg: 'var(--color-warn-bg)', fg: 'var(--color-warn-fg)', border: 'var(--color-warn-border)' },
        danger: { DEFAULT: 'var(--color-danger)', bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-fg)', border: 'var(--color-danger-border)' },
        info: { DEFAULT: 'var(--color-info)', bg: 'var(--color-info-bg)', fg: 'var(--color-info-fg)', border: 'var(--color-info-border)' },
        neutral: { bg: 'var(--color-neutral-bg)', fg: 'var(--color-neutral-fg)', border: 'var(--color-neutral-border)' },
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        modal: 'var(--radius-modal)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontSize: {
        micro: ['11px', '16px'],
        caption: ['12px', '16px'],
        label: ['13px', '18px'],
        body: ['14px', '20px'],
        subtitle: ['16px', '24px'],
        title: ['20px', '28px'],
        hero: ['24px', '32px'],
        display: ['32px', '40px'],
      },
      spacing: {
        sidebar: 'var(--sidebar-w)',
        rail: 'var(--sidebar-rail-w)',
        'view-header': 'var(--view-header-h)',
        row: 'var(--row-h)',
      },
      transitionTimingFunction: { out: 'var(--ease-out)' },
      transitionDuration: { fast: '150ms', base: '200ms', slow: '400ms' },
      zIndex: { sidebar: '30', header: '20', panel: '40', modal: '50', toast: '60', palette: '55' },
    },
  },
  plugins: [],
}
