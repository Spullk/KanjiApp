import type { CapacitorConfig } from "@capacitor/cli";

// The iPhone and Android apps wrap the same build as the website (dist/).
const config: CapacitorConfig = {
  // The App Store and Play Store identity. It can't change once the app is published.
  appId: "com.spullk.nekko",
  appName: "Nekko",
  webDir: "dist",
  backgroundColor: "#17141b",
  ios: {
    contentInset: "never",
  },
  plugins: {
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "cover" },
    LocalNotifications: { smallIcon: "ic_stat_nekko", iconColor: "#e0367d" },
  },
};

export default config;
