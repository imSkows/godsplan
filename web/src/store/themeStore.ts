import { create } from "zustand";

type Theme = "light";
interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>(() => ({
  theme: "light",
  toggle: () => {},
}));
