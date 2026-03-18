/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "do-blue": "#0069ff",
        "do-dark": "#0c0c30",
        "do-cyan": "#00c8ff",
      },
    },
  },
  plugins: [],
};
