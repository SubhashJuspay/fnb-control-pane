import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Legacy OKLCH tokens — shadcn primitives still reference these.
        border: 'oklch(var(--color-border) / <alpha-value>)',
        input: 'oklch(var(--color-input) / <alpha-value>)',
        ring: 'oklch(var(--color-ring) / <alpha-value>)',
        background: 'var(--m3-background)',
        foreground: 'var(--m3-on-background)',
        muted: {
          DEFAULT: 'oklch(var(--color-bg-muted) / <alpha-value>)',
          foreground: 'oklch(var(--color-fg-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--color-accent-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-accent-fg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'oklch(var(--color-danger-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-danger-fg) / <alpha-value>)',
        },
        // Shadcn-style aliases mapped to the new M3 palette so existing
        // primitives keep working but match the redesign.
        popover: {
          DEFAULT: 'var(--m3-surface-container-lowest)',
          foreground: 'var(--m3-on-surface)',
        },
        card: {
          DEFAULT: 'var(--m3-surface-container-lowest)',
          foreground: 'var(--m3-on-surface)',
        },
        primary: {
          DEFAULT: 'var(--m3-primary)',
          foreground: 'var(--m3-on-primary)',
          container: 'var(--m3-primary-container)',
          'on-container': 'var(--m3-on-primary-container)',
          fixed: 'var(--m3-primary-fixed)',
          'fixed-dim': 'var(--m3-primary-fixed-dim)',
          'on-fixed': 'var(--m3-on-primary-fixed)',
          'on-fixed-variant': 'var(--m3-on-primary-fixed-variant)',
          inverse: 'var(--m3-inverse-primary)',
        },
        secondary: {
          DEFAULT: 'var(--m3-secondary)',
          foreground: 'var(--m3-on-secondary)',
          container: 'var(--m3-secondary-container)',
          'on-container': 'var(--m3-on-secondary-container)',
          fixed: 'var(--m3-secondary-fixed)',
          'fixed-dim': 'var(--m3-secondary-fixed-dim)',
          'on-fixed': 'var(--m3-on-secondary-fixed)',
          'on-fixed-variant': 'var(--m3-on-secondary-fixed-variant)',
        },
        tertiary: {
          DEFAULT: 'var(--m3-tertiary)',
          foreground: 'var(--m3-on-tertiary)',
          container: 'var(--m3-tertiary-container)',
          'on-container': 'var(--m3-on-tertiary-container)',
          fixed: 'var(--m3-tertiary-fixed)',
          'fixed-dim': 'var(--m3-tertiary-fixed-dim)',
          'on-fixed': 'var(--m3-on-tertiary-fixed)',
          'on-fixed-variant': 'var(--m3-on-tertiary-fixed-variant)',
        },
        destructive: {
          DEFAULT: 'var(--m3-error)',
          foreground: 'var(--m3-on-error)',
        },
        // M3 surface ramp.
        surface: {
          DEFAULT: 'var(--m3-surface)',
          dim: 'var(--m3-surface-dim)',
          bright: 'var(--m3-surface-bright)',
          variant: 'var(--m3-surface-variant)',
          tint: 'var(--m3-surface-tint)',
          container: {
            DEFAULT: 'var(--m3-surface-container)',
            lowest: 'var(--m3-surface-container-lowest)',
            low: 'var(--m3-surface-container-low)',
            high: 'var(--m3-surface-container-high)',
            highest: 'var(--m3-surface-container-highest)',
          },
          inverse: 'var(--m3-inverse-surface)',
          'on-inverse': 'var(--m3-inverse-on-surface)',
        },
        'on-surface': {
          DEFAULT: 'var(--m3-on-surface)',
          variant: 'var(--m3-on-surface-variant)',
        },
        'on-background': 'var(--m3-on-background)',
        // Top-level `on-<role>` aliases. The components use class names like
        // `text-on-primary`, `text-on-primary-container`, `text-on-secondary`,
        // `bg-on-primary` etc. These DON'T resolve to `primary.foreground` —
        // Tailwind looks them up as their own color key. Without these
        // entries the classes generate no CSS, text inherits the body color
        // (dark navy), and ends up looking ~black on blue surfaces.
        'on-primary': {
          DEFAULT: 'var(--m3-on-primary)',
          container: 'var(--m3-on-primary-container)',
          fixed: 'var(--m3-on-primary-fixed)',
          'fixed-variant': 'var(--m3-on-primary-fixed-variant)',
        },
        'on-secondary': {
          DEFAULT: 'var(--m3-on-secondary)',
          container: 'var(--m3-on-secondary-container)',
          fixed: 'var(--m3-on-secondary-fixed)',
          'fixed-variant': 'var(--m3-on-secondary-fixed-variant)',
        },
        'on-tertiary': {
          DEFAULT: 'var(--m3-on-tertiary)',
          container: 'var(--m3-on-tertiary-container)',
          fixed: 'var(--m3-on-tertiary-fixed)',
          'fixed-variant': 'var(--m3-on-tertiary-fixed-variant)',
        },
        'on-error': {
          DEFAULT: 'var(--m3-on-error)',
          container: 'var(--m3-on-error-container)',
        },
        'on-success': {
          DEFAULT: 'var(--m3-on-success)',
          container: 'var(--m3-on-success-container)',
        },
        'on-warning': {
          DEFAULT: 'var(--m3-on-warning)',
          container: 'var(--m3-on-warning-container)',
        },
        outline: {
          DEFAULT: 'var(--m3-outline)',
          variant: 'var(--m3-outline-variant)',
        },
        // Semantic state colors used across KDS / ticket states.
        success: {
          DEFAULT: 'var(--m3-success)',
          foreground: 'var(--m3-on-success)',
          container: 'var(--m3-success-container)',
          'on-container': 'var(--m3-on-success-container)',
        },
        warning: {
          DEFAULT: 'var(--m3-warning)',
          foreground: 'var(--m3-on-warning)',
          container: 'var(--m3-warning-container)',
          'on-container': 'var(--m3-on-warning-container)',
        },
        error: {
          DEFAULT: 'var(--m3-error)',
          foreground: 'var(--m3-on-error)',
          container: 'var(--m3-error-container)',
          'on-container': 'var(--m3-on-error-container)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-hanken)', 'system-ui', 'sans-serif'],
        // Aliases mirroring the design ref vocabulary.
        'display-lg': ['var(--font-hanken)', 'system-ui', 'sans-serif'],
        'headline-md': ['var(--font-hanken)', 'system-ui', 'sans-serif'],
        'body-customer': ['var(--font-inter)', 'system-ui', 'sans-serif'],
        'body-staff': ['var(--font-inter)', 'system-ui', 'sans-serif'],
        'label-caps': ['var(--font-inter)', 'system-ui', 'sans-serif'],
        'status-pill': ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['36px', { lineHeight: '1.2', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'body-customer': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-staff': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'label-caps': [
          '12px',
          { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '700' },
        ],
        'status-pill': ['11px', { lineHeight: '1', fontWeight: '600' }],
      },
      spacing: {
        'base-unit': '4px',
        'container-margin': '24px',
        gutter: '16px',
        'card-padding': '20px',
        'stack-tight': '8px',
        'stack-loose': '32px',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'card-soft': '0px 4px 12px rgba(15, 23, 42, 0.05)',
        'overlay-soft': '0px 12px 24px rgba(15, 23, 42, 0.1)',
        'inset-top-sm': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
        'bottom-bar': '0 -4px 12px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};

export default preset;
