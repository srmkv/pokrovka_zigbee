module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Raleway", "sans-serif"],
    },
    extend: {
      colors: {
        darkblue: "#1E213A",
        gray: {
          150: "#E7E7EB",
          250: "#A09FB1",
          350: "#88869D",
        },
        // Семантические токены тем (значения — в CSS-переменных --c-*, см. styles/index.css).
        // НОВЫЕ компоненты используют их (bg-card / bg-panel / border-line / text-ink…)
        // вместо сырых hex — тогда они темятся во всех темах автоматически.
        surface: "var(--c-surface)",
        "surface-deep": "var(--c-surface-deep)",
        card: "var(--c-card)",
        panel: "var(--c-panel)",
        "panel-2": "var(--c-panel-2)",
        inset: "var(--c-inset)",
        "inset-2": "var(--c-inset-2)",
        line: "var(--c-line)",
        ink: "var(--c-ink)",
        "ink-soft": "var(--c-ink-soft)",
        "ink-muted": "var(--c-ink-muted)",
        accent: "var(--c-accent)",
      },
    },
  },
  plugins: [],
};
