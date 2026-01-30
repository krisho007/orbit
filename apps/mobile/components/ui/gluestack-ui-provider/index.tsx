"use client";

import React, { createContext, useContext, useMemo } from "react";
import { View, useColorScheme } from "react-native";
import { config } from "./config";

type ColorMode = "light" | "dark" | "system";

interface GluestackUIContextType {
  colorMode: ColorMode;
  resolvedColorMode: "light" | "dark";
}

const GluestackUIContext = createContext<GluestackUIContextType>({
  colorMode: "system",
  resolvedColorMode: "light",
});

export const useGluestackUI = () => useContext(GluestackUIContext);

interface GluestackUIProviderProps {
  mode?: ColorMode;
  children: React.ReactNode;
}

export function GluestackUIProvider({
  mode = "system",
  children,
}: GluestackUIProviderProps) {
  const systemColorScheme = useColorScheme();

  const resolvedColorMode = useMemo(() => {
    if (mode === "system") {
      return systemColorScheme === "dark" ? "dark" : "light";
    }
    return mode;
  }, [mode, systemColorScheme]);

  const contextValue = useMemo(
    () => ({
      colorMode: mode,
      resolvedColorMode,
    }),
    [mode, resolvedColorMode]
  );

  const themeStyles = resolvedColorMode === "dark" ? config.dark : config.light;

  return (
    <GluestackUIContext.Provider value={contextValue}>
      <View style={[{ flex: 1 }, themeStyles]} className="bg-background-0">
        {children}
      </View>
    </GluestackUIContext.Provider>
  );
}

export { config };
