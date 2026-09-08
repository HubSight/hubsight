/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#71717a',
          600: '#3f3f46',
          700: '#27272a', // Crisp dark border (Zinc 800)
          800: '#18181b', // Deep charcoal surface / inputs / hover (Zinc 900)
          850: '#111113', // Intermediate deep black
          900: '#09090b', // Pitch-black-charcoal container / card / modal / sidebar (Zinc 950)
          950: '#000000', // Pure pitch-black OLED background
        },
      },
    },
  },
  plugins: [],
}

