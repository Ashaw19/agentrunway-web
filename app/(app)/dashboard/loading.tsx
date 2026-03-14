// Dashboard loading skeleton — shown while the server component fetches data.
// Mirrors the real dashboard layout: greeting + 4 KPI cards + hero + 4 secondary cards.

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

      {/* Runway Score hero card */}
      <div className="bg-card border border-border/50 rounded-xl p-6 animate-pulse">
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-2">
            <Sk className="h-5 w-32" />
            <Sk className="h-3.5 w-48" />
          </div>
          <Sk className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-6">
          <Sk className="h-28 w-28 rounded-full shrink-0" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Sk className="h-3 w-24" />
                <Sk className="h-2 flex-1 rounded-full" />
                <Sk className="h-3 w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4 secondary cards (2-column) */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-4 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <Sk className="h-4 w-32" />
              <Sk className="h-4 w-4 rounded-full" />
            </div>
            <Sk className="h-6 w-24" />
            <div className="space-y-2">
              <Sk className="h-3 w-full" />
              <Sk className="h-3 w-3/4" />
              <Sk className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
