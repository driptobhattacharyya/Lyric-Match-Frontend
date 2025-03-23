/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          purple: {
            300: '#a78bfa',
            600: '#5D3FD3',
            700: '#4c31b9',
          },
          teal: {
            300: '#5eead4',
            600: '#20B2AA',
            700: '#0e9994',
          },
          yellow: {
            300: '#fcd34d',
            400: '#FFD700',
          },
          gray: {
            700: '#374151',
            800: '#1f2937',
            900: '#2C2C2C',
          },
        },
      },
    },
    plugins: [],
  }