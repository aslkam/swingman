/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'golf-green': '#2D6A4F',
        'golf-light': '#40916C',
        'golf-dark': '#1B4332',
      },
    },
  },
  plugins: [],
}
