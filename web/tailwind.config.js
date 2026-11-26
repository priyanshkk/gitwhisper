/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          950: '#08090c',
          900: '#0d0f15',
          850: '#101219',
          800: '#151824',
          700: '#222634',
        },
        accent: {
          cyan: '#22d3ee',
          indigo: '#818cf8',
          green: '#34d399',
          amber: '#fbbf24',
          red: '#f87171',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,211,238,.12), 0 24px 80px -40px rgba(34,211,238,.45)',
      },
    },
  },
  plugins: [],
};
