import ContributorApp from "@/app/contributor-app";
import { LANGUAGES } from "@/lib/languages";

export default function ProfilePage() {
  return <ContributorApp languages={LANGUAGES} initialView="profile" />;
}
