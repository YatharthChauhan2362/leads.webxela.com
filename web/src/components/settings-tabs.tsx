import { Tabs } from "@/components/ui/layout";

const TABS = [
  { key: "preferences", label: "Lead rules", href: "/preferences" },
  { key: "engines", label: "Search engines", href: "/engines" },
  { key: "settings", label: "Searches and branding", href: "/settings" },
];

/** The settings pages share one menu link and these tabs, so every setting is one tap from another. */
export function SettingsTabs({ active }: { active: "preferences" | "engines" | "settings" }) {
  return <Tabs active={active} label="Settings" tabs={TABS} />;
}
