/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        foreground: 'hsl(var(--color-text-primary) / <alpha-value>)',
        'background-foreground': 'hsl(var(--color-bg-body) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--color-bg-surface-alt) / <alpha-value>)',
          foreground: 'hsl(var(--color-text-secondary) / <alpha-value>)',
        },
        background: 'hsl(var(--color-bg-body) / <alpha-value>)',
        card: 'hsl(var(--color-bg-surface) / <alpha-value>)',
        input: 'hsl(var(--color-bg-input) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
        ring: '#DE4E32',
        primary: {
          DEFAULT: 'hsl(var(--color-primary) / <alpha-value>)',
          foreground: 'hsl(var(--color-primary-foreground) / <alpha-value>)',
        },
        destructive: 'hsl(var(--color-destructive) / <alpha-value>)',
        'text-primary': 'hsl(var(--color-text-primary) / <alpha-value>)',
        'text-secondary': 'hsl(var(--color-text-secondary) / <alpha-value>)',
        'text-muted': 'hsl(var(--color-text-muted) / <alpha-value>)',
        'bg-body': 'hsl(var(--color-bg-body) / <alpha-value>)',
        'bg-surface': 'hsl(var(--color-bg-surface) / <alpha-value>)',
        'bg-surface-alt': 'hsl(var(--color-bg-surface-alt) / <alpha-value>)',
        'bg-interactive': 'hsl(var(--color-bg-interactive) / <alpha-value>)',
        'bg-input': 'hsl(var(--color-bg-input) / <alpha-value>)',
        'text-input': 'hsl(var(--color-text-input) / <alpha-value>)',
        'border-input': 'hsl(var(--color-border-input) / <alpha-value>)',
        base: {
          950: 'hsl(var(--color-bg-body) / <alpha-value>)',
          900: 'hsl(var(--color-bg-surface) / <alpha-value>)',
          800: 'hsl(var(--color-bg-surface-alt) / <alpha-value>)',
          700: 'hsl(var(--color-bg-interactive) / <alpha-value>)',
        },
        accent: {
          DEFAULT: '#DE4E32',
          dim: '#B83E27',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-in-out',
        slideUp: 'slideUp 0.4s ease-out',
        slideDown: 'slideDown 0.3s ease-out',
        pulse: 'pulse 2s infinite',
        bounceIn: 'bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}