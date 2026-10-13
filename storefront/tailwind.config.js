/** @type {import('tailwindcss').Config} */
// Colours are the theme tokens (CSS variables) so Tailwind utilities follow the published theme too.
export default {
  // The design artboards have no CSS reset (content-box, UA defaults) - Tailwind's preflight (border-box etc.)
  // would shift every pixel, so it is off and src/index.css carries the same tiny base the artboards use.
  corePlugins: { preflight: false },
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)', 'on-primary': 'var(--color-on-primary)', 'primary-strong': 'var(--color-primary-strong)',
        'primary-soft': 'var(--color-primary-soft)', secondary: 'var(--color-secondary)', bg: 'var(--color-bg)',
        'bg-soft': 'var(--color-bg-soft)', surface: 'var(--color-surface)', text: 'var(--color-text)', 'text-2': 'var(--color-text-2)',
        'text-3': 'var(--color-text-3)', line: 'var(--color-border)', 'line-strong': 'var(--color-border-strong)',
        success: 'var(--color-success)', warning: 'var(--color-warning)', error: 'var(--color-error)', live: 'var(--color-live)',
      },
      fontFamily: {
        sans: ["'Noto Sans TC'", "'PingFang TC'", "'Microsoft JhengHei'", 'system-ui', 'sans-serif'],
        serif: ["'Noto Serif TC'", "'Songti TC'", 'serif'],
      },
    },
  },
  plugins: [],
}
