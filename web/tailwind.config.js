/** @type {import('tailwindcss').Config} */

/**
 * Every colour resolves through a CSS custom property, so one `data-theme`
 * attribute on <html> switches the whole app between light and dark.
 * Triplets are SPACE separated — comma-separated channels are a parse error
 * once Tailwind appends `/ <alpha-value>`. See src/index.css.
 */
const themed = (name) => `rgb(var(--donkey-${name}-rgb) / <alpha-value>)`;

export default {
  // driver.html is a real entry point; without it, classes used only in the
  // driver shell are never generated
  content: ['./index.html', './driver.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        donkey: {
          bg: themed('bg'),
          surface: themed('surface'),
          card: themed('card'),
          border: themed('border'),
          text: themed('text'),
          muted: themed('muted'),
          purple: themed('primary'),
          pink: themed('secondary'),
          green: themed('accent'),
          // Foreground/action variants that remain readable on the light
          // theme's white and tinted cards. Brighter neon values still power
          // non-text glows in index.css, where contrast is not carrying words.
          orange: '#995100',
          red: '#c62828',
          blue: '#006f9e',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(var(--theme-gradient-angle, 135deg), var(--theme-gradient-from, #b24cf3) 0%, var(--theme-gradient-to, #ff6ec7) 100%)',
      },
    },
  },
  plugins: [],
};
