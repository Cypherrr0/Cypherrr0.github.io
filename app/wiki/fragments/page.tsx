import type { Metadata } from "next";
import { FragmentVault } from "@/components/fragment-vault";
import { getFragmentPages } from "@/lib/wiki";

export const metadata: Metadata = {
  description: "Fragments outside the public Corepedia graph.",
  robots: {
    follow: false,
    index: false,
  },
  title: "ፍርስራሾች",
};

export default function FragmentIndex() {
  return <FragmentVault pages={getFragmentPages()} />;
}
