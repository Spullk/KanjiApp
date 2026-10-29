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
    // Native Google sign-in only hands back a token; the Firebase JS SDK (src/sync.ts) does the actual sign-in.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ["google.com"] },
  },
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: "6.1",
        // Avoids a Swift package name clash with Firebase's own package, and leaves out the Facebook SDK.
        packageOptions: { "@capacitor-firebase/authentication": { symlink: true } },
        packageTraits: { "@capacitor-firebase/authentication": ["Google"] },
      },
    },
  },
};

export default config;
