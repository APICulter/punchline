/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    screens: {
      "small-phone": "100px",
      "big-phone": "425px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        // Punchline palette
        plum: { DEFAULT: "#2B1740", soft: "#4A2F63" },
        coral: { DEFAULT: "#FF6A4D", deep: "#F0502F", light: "#FF8B72" },
        butter: { DEFAULT: "#FFD45E", deep: "#F5BE2C" },
        pink: { DEFAULT: "#FF4F8C", deep: "#E8336F" },
        milk: { DEFAULT: "#FFF7F0", dim: "#F6E6DA" },
        mint: { DEFAULT: "#22C993" },
      },
      fontFamily: {
        sans: ['"Bricolage Grotesque"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        pop: "0 4px 0 0 #2B1740",
        "pop-sm": "0 2px 0 0 #2B1740",
        "pop-lg": "0 8px 0 0 #2B1740",
      },
    },
  },
  plugins: [],
};
