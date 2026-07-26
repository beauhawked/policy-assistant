import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.scarletfire.policytoaction",
  appName: "Policy to Action",
  webDir: "mobile-shell",
  server: {
    url: "https://policytoaction.beauhawked.com/policy-assistant",
    allowNavigation: ["policytoaction.beauhawked.com"],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0f2c46",
  },
  android: {
    backgroundColor: "#0f2c46",
    allowMixedContent: false,
  },
};

export default config;
