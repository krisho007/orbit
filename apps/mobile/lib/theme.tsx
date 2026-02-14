import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGluestackUI } from "../components/ui/gluestack-ui-provider";
import { colorTokens } from "../components/ui/gluestack-ui-provider/config";

export type ThemeColors = typeof colorTokens.light;
export type ThemeMode = "light" | "dark" | "system";

type ColorTokenKey = keyof ThemeColors;
export type ThemeColorToken = ColorTokenKey extends `--color-${infer Token}`
  ? Token
  : never;

const THEME_MODE_KEY = "theme-mode";

export function getThemeColor(colors: ThemeColors, token: ThemeColorToken) {
  const key = `--color-${token}` as ColorTokenKey;
  return colors[key];
}

export function useThemeColors(): ThemeColors {
  const { resolvedColorMode } = useGluestackUI();

  return useMemo(
    () => colorTokens[resolvedColorMode],
    [resolvedColorMode]
  );
}

export function useThemeColor(token: ThemeColorToken) {
  const colors = useThemeColors();
  return getThemeColor(colors, token);
}

export function useThemeModeStorage() {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((value) => {
        if (!isMounted) return;
        if (value === "light" || value === "dark" || value === "system") {
          setModeState(value);
          return;
        }

        // Persist the default mode explicitly for first-run installs.
        setModeState("system");
        AsyncStorage.setItem(THEME_MODE_KEY, "system").catch(() => {
          // Ignore storage errors.
        });
      })
      .catch(() => {
        // Ignore storage errors and fall back to system.
      })
      .finally(() => {
        if (isMounted) setIsReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {
      // Ignore storage errors.
    });
  }, []);

  return { mode, setMode, isReady };
}

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isReady: boolean;
};

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: "system",
  setMode: () => {},
  isReady: false,
});

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const value = useThemeModeStorage();
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
