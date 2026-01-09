import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.orbit.app",
  appName: "Orbit",
  // For development, you can use localhost
  // For production, use your hosted URL
  webDir: "www",
  server: {
    // Production Orbit URL
    url: "https://orbit-xi-five.vercel.app",
    // url: "http://10.0.2.2:3000",  // 10.0.2.2 = host machine from Android emulator
    cleartext: true,
    // Allow navigation to external URLs for OAuth
    allowNavigation: ["accounts.google.com", "*.google.com"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#4F46E5",
      showSpinner: false,
    },
  },
  android: {
    // Deep link scheme for OAuth callbacks
    // Handles: orbit://auth/*
  },
}

export default config
