import type { Config } from "tailwindcss";

/** Map an HSL-channel CSS var to a Tailwind color that supports opacity. */
const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: hsl("background"),
        surface: hsl("surface"),
        foreground: hsl("foreground"),
        muted: {
          DEFAULT: hsl("muted"),
          foreground: hsl("muted-foreground"),
        },
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        primary: {
          DEFAULT: hsl("primary"),
          hover: hsl("primary-hover"),
          foreground: hsl("primary-foreground"),
          subtle: hsl("primary-subtle"),
        },
        success: {
          DEFAULT: hsl("success"),
          foreground: hsl("success-foreground"),
          subtle: hsl("success-subtle"),
          text: hsl("success-text"),
        },
        warning: {
          DEFAULT: hsl("warning"),
          foreground: hsl("warning-foreground"),
          subtle: hsl("warning-subtle"),
          text: hsl("warning-text"),
        },
        danger: {
          DEFAULT: hsl("danger"),
          foreground: hsl("danger-foreground"),
          subtle: hsl("danger-subtle"),
          text: hsl("danger-text"),
        },
        info: {
          DEFAULT: hsl("info"),
          foreground: hsl("info-foreground"),
          subtle: hsl("info-subtle"),
          text: hsl("info-text"),
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(16 24 40 / 0.04)",
        sm: "0 1px 3px 0 rgb(16 24 40 / 0.08), 0 1px 2px -1px rgb(16 24 40 / 0.06)",
        md: "0 4px 12px -2px rgb(16 24 40 / 0.10), 0 2px 6px -2px rgb(16 24 40 / 0.06)",
        lg: "0 12px 28px -6px rgb(16 24 40 / 0.16), 0 4px 10px -4px rgb(16 24 40 / 0.08)",
        popover: "0 8px 24px -4px rgb(16 24 40 / 0.16), 0 2px 8px -2px rgb(16 24 40 / 0.08)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-up": "slide-up 0.18s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "overlay-in": "overlay-in 0.15s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
