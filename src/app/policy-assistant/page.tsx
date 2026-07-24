import { PolicyAssistantApp } from "@/components/policy-assistant-app";

export const dynamic = "force-dynamic";

export default function PolicyAssistantPage() {
  // The workspace owns the full viewport: navigation, the high-contrast toggle,
  // and source management (including the scraper) all live in the app shell now.
  return <PolicyAssistantApp />;
}
