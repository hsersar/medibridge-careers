import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.medibridge.careers",
  appName: "MediBridge Careers",
  webDir: "public",
  server: {
    url: "https://medibridge-careers.vercel.app",
    cleartext: false,
    allowNavigation: ["medibridge-careers.vercel.app"],
  },
};

export default config;
