/** @type {import('tailwindcss').Config} */
export default {
  content:[
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'duo-green': '#58cc02',
        'duo-green-dark': '#58a700',
        'duo-blue': '#1cb0f6',
        'duo-blue-dark': '#1899d6',
        'duo-red': '#ff4b4b',
        'duo-red-dark': '#ea2b2b',
        'duo-purple': '#ce82ff',
        'duo-yellow': '#ffc800',
        'duo-gray': '#e5e5e5',
        'duo-gray-dark': '#afafaf',
      },
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
      }
    },
  },
  plugins:[],
}