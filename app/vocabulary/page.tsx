import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function VocabularyPage() {
  return <ContributorApp languages={LANGUAGES} initialView="vocabulary" />;
}
