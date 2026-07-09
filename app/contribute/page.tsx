import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function ContributePage() {
  return <ContributorApp languages={LANGUAGES} initialView="contribute" />;
}
