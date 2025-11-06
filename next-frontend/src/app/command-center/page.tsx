import { Metadata } from "next";
import AICommandCenter from "@/components/AICommandCenter";

export const metadata: Metadata = {
  title: "AI Command Center • Trading Dashboard",
  description:
    "Daily directional bias, macro radar, and journal intelligence powered by AI.",
};

export default function CommandCenterPage() {
  return <AICommandCenter />;
}
