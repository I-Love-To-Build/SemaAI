import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function IntelligencePage() {
  return <ContributorApp languages={LANGUAGES} initialView="intelligence" />;
}
