import { Metadata } from "next";
import ChartView from "@/components/ChartView";

export const metadata: Metadata = {
  title: "Chart Workspace • Trading Dashboard",
  description:
    "Enter ticker symbols, explore price action, and collaborate with the GPT-5 trading copilot.",
};

export default function ChartWorkspacePage() {
  return <ChartView />;
}
