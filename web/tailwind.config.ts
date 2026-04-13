import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        panel: "rgb(18 21 30)",
        accent: "rgb(59 130 246)",
      },
    },
  },
  plugins: [],
} satisfies Config;
