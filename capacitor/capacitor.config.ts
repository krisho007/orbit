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
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#4F46E5",
      showSpinner: false,
    },
  },
  android: {
    // Production uses HTTPS only
  },
}

export default config
