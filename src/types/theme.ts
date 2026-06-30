// Единый источник правды по темам интерфейса.
// Добавление новой темы: дописать id сюда + блок .theme-<id> в styles/index.css
// + карточку в настройках (MainContent → вкладка «Настройки»).
export type ThemeId = "dark" | "light" | "midnight" | "day";

export const THEME_IDS: ThemeId[] = ["dark", "light", "midnight", "day"];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as string[]).includes(value);
}
