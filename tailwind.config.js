
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        copec: {
          red: '#E30613',
          blue: '#003366',
          blue2: '#0055A4',
        }
      }
    },
  },
  plugins: [],
}
