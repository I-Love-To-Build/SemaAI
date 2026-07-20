import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function SettingsPage() {
  return <ContributorApp languages={LANGUAGES} initialView="settings" />;
}
