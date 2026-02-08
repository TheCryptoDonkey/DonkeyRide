/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        donkey: {
          bg: '#0a0a0a',
          surface: '#1a1a2e',
          card: '#16213e',
          border: '#333',
          text: '#e0e0e0',
          muted: '#999',
          purple: 'rgb(var(--theme-primary-rgb) / <alpha-value>)',
          pink: 'rgb(var(--theme-secondary-rgb) / <alpha-value>)',
          green: 'rgb(var(--theme-accent-rgb) / <alpha-value>)',
          orange: '#f5a623',
          red: '#ff4444',
          blue: '#4fc3f7',
        },
      },
      fontFamily: {
        mono: ['SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(var(--theme-gradient-angle, 135deg), var(--theme-gradient-from, #b24cf3) 0%, var(--theme-gradient-to, #ff6ec7) 100%)',
      },
    },
  },
  plugins: [],
};
