import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function MissionsPage() {
  return <ContributorApp languages={LANGUAGES} initialView="missions" />;
}
