import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base colors - inspired by Linear/Notion dark themes
        background: {
          DEFAULT: "#0a0a0a",
          subtle: "#121212",
          surface: "#1a1a1a",
          elevated: "#222222",
        },
        border: {
          DEFAULT: "#2a2a2a",
          subtle: "#1f1f1f",
          strong: "#3a3a3a",
        },
        text: {
          primary: "#f5f5f5",
          secondary: "#a0a0a0",
          tertiary: "#6b6b6b",
          inverted: "#0a0a0a",
        },
        // Semantic colors with refined palettes
        success: {
          DEFAULT: "#10b981",
          subtle: "#064e3b",
          hover: "#059669",
          text: "#34d399",
        },
        error: {
          DEFAULT: "#ef4444",
          subtle: "#7f1d1d",
          hover: "#dc2626",
          text: "#f87171",
        },
        warning: {
          DEFAULT: "#f59e0b",
          subtle: "#78350f",
          text: "#fbbf24",
        },
        primary: {
          DEFAULT: "#3b82f6",
          subtle: "#1e3a8a",
          hover: "#2563eb",
          text: "#60a5fa",
        },
        // Trading-specific colors
        profit: {
          DEFAULT: "#10b981",
          strong: "#059669",
          subtle: "#064e3b",
          text: "#34d399",
        },
        loss: {
          DEFAULT: "#ef4444",
          strong: "#dc2626",
          subtle: "#7f1d1d",
          text: "#f87171",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "SF Mono",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        sm: ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.005em" }],
        base: ["1rem", { lineHeight: "1.5rem", letterSpacing: "0" }],
        lg: ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.005em" }],
        xl: ["1.25rem", { lineHeight: "1.875rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }],
        "3xl": [
          "1.875rem",
          { lineHeight: "2.25rem", letterSpacing: "-0.02em" },
        ],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }],
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "112": "28rem",
        "128": "32rem",
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.15)",
        DEFAULT:
          "0 1px 3px 0 rgba(0, 0, 0, 0.2), 0 1px 2px 0 rgba(0, 0, 0, 0.12)",
        md: "0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.12)",
        lg: "0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.12)",
        xl: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
        inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)",
        "glow-success": "0 0 20px rgba(16, 185, 129, 0.15)",
        "glow-error": "0 0 20px rgba(239, 68, 68, 0.15)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
