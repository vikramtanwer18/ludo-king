import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2142",
        muted: "#5B6385",
        board: "#EEF1F8",
        line: "#D9DEEB",
        red: { DEFAULT: "#C83737", soft: "#FDECEC", ink: "#B42F2F" },
        green: { DEFAULT: "#16834F", soft: "#E5F6EE", ink: "#12744A" },
        yellow: { DEFAULT: "#F2B01E", soft: "#FEF5DE", ink: "#5C3D00" },
        blue: { DEFAULT: "#2559D6", soft: "#E8EFFD" },
      },
      fontFamily: {
        display: ['"Baloo 2"', "system-ui", "sans-serif"],
        body: ["Hind", "system-ui", "sans-serif"],
      },
      borderRadius: {
        tile: "14px",
      },
      boxShadow: {
        lift: "0 1px 0 #D9DEEB, 0 8px 24px -16px rgba(27,33,66,.35)",
      },
    },
  },
  plugins: [],
};
export default config;
