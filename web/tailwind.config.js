/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm teal and sand: the palette reads as tropical hospitality
        // rather than generic SaaS blue.
        brand: {
          50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
          400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
          800: '#115e59', 900: '#134e4a',
        },
        sand: {
          50: '#fdfbf7', 100: '#f8f3e9', 200: '#efe5d3', 300: '#e2d2b6',
          400: '#cdb389', 500: '#b8946a', 600: '#9a7550',
        },
      },
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
