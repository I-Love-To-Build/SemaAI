import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function GovernancePage() {
  return <ContributorApp languages={LANGUAGES} initialView="governance" />;
}
