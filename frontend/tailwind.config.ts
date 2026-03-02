import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a0a0a',
        surface: { 1: '#111111', 2: '#1a1a1a', 3: '#222222' },
        border: { DEFAULT: '#2a2a2a', active: '#ffaa00' },
        accent: { DEFAULT: '#ffaa00', hover: '#ffbb33' },
        success: '#00cc66',
        danger: '#ff4444',
        warning: '#ff8800',
        info: '#4499ff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: '10px',
        sm: '12px',
        base: '13px',
        lg: '16px',
        xl: '20px',
      },
    },
  },
  plugins: [],
} satisfies Config;
