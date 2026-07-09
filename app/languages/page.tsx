import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function LanguagesPage() {
  return <ContributorApp languages={LANGUAGES} initialView="languages" />;
}
