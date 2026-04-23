import { create } from "zustand";

type Theme = "light" | "dark";
interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const stored = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as Theme | null;
const prefersDark =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
const initial: Theme = stored ?? (prefersDark ? "dark" : "light");

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* ignore */
      }
      return { theme: next };
    }),
}));
