// Pipeline loading skeleton — runs pipeline-forecast-engine over deals + buyers + listings.
const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function PipelineLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Sk className="h-7 w-40" />
        <Sk className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse"
          >
            <Sk className="h-3.5 w-24" />
            <Sk className="h-8 w-32" />
            <Sk className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4 animate-pulse">
        <Sk className="h-5 w-40" />
        <div className="flex items-center gap-1 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Sk key={i} className="h-12 w-24" />
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse"
          >
            <Sk className="h-4 w-32" />
            <Sk className="h-4 w-full" />
            <Sk className="h-4 w-3/4" />
            <Sk className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
