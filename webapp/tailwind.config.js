/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    borderRadius: {
      'none': '0px',
      'xs': '2px',
      'sm': '2px',
      DEFAULT: '3px',
      'md': '4px',
      'lg': '4px',
      'xl': '5px',
      '2xl': '6px',
      '3xl': '6px',
      'full': '9999px',
    },
    extend: {
      boxShadow: {
        '2xs': '0 1px 1px rgb(15 23 42 / 0.04)',
        xs: '0 1px 2px rgb(15 23 42 / 0.06)',
      },
      colors: {
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          850: '#17212d',
          900: '#111820',
          950: '#0b0f14',
        },
      },
    },
  },
  plugins: [],
}
