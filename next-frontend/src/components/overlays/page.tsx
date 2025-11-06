import { ChatPanel } from "@/components/overlays/ChatPanel";

function PlaceholderChart() {
  return (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-lg border border-dashed border-border bg-background-secondary">
      <p className="text-text-secondary">Main Chart Component</p>
    </div>
  );
}

export default function ChartViewPage() {
  return (
    <main className="h-full p-4 md:p-6 lg:p-8">
      <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content: Chart */}
        <div className="h-full lg:col-span-2">
          {/* 
            This is where your actual chart component will go.
            For now, I'm using a placeholder.
          */}
          <PlaceholderChart />
        </div>

        {/* Sidebar: Chat Panel */}
        <div className="h-full min-h-[500px] lg:col-span-1">
          <ChatPanel />
        </div>
      </div>
    </main>
  );
}
