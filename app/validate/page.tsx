import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function ValidatePage() {
  return <ContributorApp languages={LANGUAGES} initialView="validate" />;
}
