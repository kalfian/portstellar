/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#04060d",
          900: "#070a14",
          850: "#0a0f1c",
          800: "#0d1320",
          700: "#131a2a",
          600: "#1a2336",
          500: "#243049",
        },
        phos: {
          DEFAULT: "#3b8bff",
          dim: "#0066cc",
          glow: "#5fa8ff",
          deep: "#002a55",
          base: "#0066cc",
        },
        amber: {
          crt: "#ffb454",
          dim: "#cc8a3d",
        },
        paper: {
          DEFAULT: "#f1f3f8",
          card: "#fafbfd",
          ink: "#08111f",
          line: "#08111f",
          mute: "#4a556a",
        },
      },
      animation: {
        "phos-pulse": "phosPulse 1.8s ease-in-out infinite",
        scan: "scan 8s linear infinite",
        flicker: "flicker 4s steps(3, end) infinite",
        blink: "blink 1.1s steps(2, end) infinite",
      },
      keyframes: {
        phosPulse: {
          "0%, 100%": {
            opacity: "1",
            filter: "drop-shadow(0 0 6px currentColor)",
          },
          "50%": {
            opacity: "0.6",
            filter: "drop-shadow(0 0 2px currentColor)",
          },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.985" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
