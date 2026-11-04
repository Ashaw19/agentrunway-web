// Dashboard loading skeleton — shown while the server component fetches data.
// Mirrors the real dashboard layout: greeting + Today zone + hero + 4 KPI cards + brief.

const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Greeting + motivational tag */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Sk className="h-7 w-52" />
          <Sk className="h-4 w-36" />
        </div>
        {/* View toggle buttons */}
        <Sk className="h-9 w-48 rounded-lg" />
      </div>

      {/* Today: Daily Briefing + Checklist */}
      <div className="grid items-start gap-3 lg:grid-cols-[3fr_2fr]">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-4 animate-pulse"
          >
            <Sk className="h-4 w-32" />
            <div className="space-y-2">
              <Sk className="h-3 w-full" />
              <Sk className="h-3 w-3/4" />
              <Sk className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>

      {/* Runway Score hero card */}
      <div className="bg-card border border-border/50 rounded-xl p-4 animate-pulse">
        <div className="flex items-center gap-6">
          <Sk className="h-28 w-28 rounded-full shrink-0" />
          <div className="hidden flex-1 grid-cols-5 gap-3 xl:grid">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Sk className="h-3 w-full" />
                <Sk className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
          <Sk className="h-24 w-44 shrink-0" />
        </div>
        <Sk className="mt-3 h-10 w-full rounded-lg" />
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <Sk className="h-3.5 w-20" />
              <Sk className="h-4 w-4 rounded-full" />
            </div>
            <Sk className="h-8 w-28" />
            <Sk className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Morning Brief */}
      <div className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse">
        <Sk className="h-4 w-40" />
        <Sk className="h-3 w-full" />
        <Sk className="h-3 w-3/4" />
      </div>
    </div>
  );
}
