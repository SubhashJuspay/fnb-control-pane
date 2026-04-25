import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'oklch(var(--color-border) / <alpha-value>)',
        input: 'oklch(var(--color-input) / <alpha-value>)',
        ring: 'oklch(var(--color-ring) / <alpha-value>)',
        background: 'oklch(var(--color-bg-canvas) / <alpha-value>)',
        foreground: 'oklch(var(--color-fg-default) / <alpha-value>)',
        muted: {
          DEFAULT: 'oklch(var(--color-bg-muted) / <alpha-value>)',
          foreground: 'oklch(var(--color-fg-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--color-accent-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-accent-fg) / <alpha-value>)',
        },
        surface: 'oklch(var(--color-bg-surface) / <alpha-value>)',
        danger: {
          DEFAULT: 'oklch(var(--color-danger-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-danger-fg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'oklch(var(--color-success-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-success-fg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default preset;
