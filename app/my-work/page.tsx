import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function MyWorkPage() {
  return <ContributorApp languages={LANGUAGES} initialView="history" />;
}
