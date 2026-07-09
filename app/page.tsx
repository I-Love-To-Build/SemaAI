import { LANGUAGES } from "@/lib/languages";
import ContributorApp from "./contributor-app";

export default function Home() {
  return <ContributorApp languages={LANGUAGES} />;
}
