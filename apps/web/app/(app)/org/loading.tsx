const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function OrgLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Sk className="h-8 w-64" />
        <Sk className="h-4 w-48" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Sk className="h-24" />
        <Sk className="h-24" />
        <Sk className="h-24" />
        <Sk className="h-24" />
      </div>

      {/* Table */}
      <Sk className="h-80" />
    </div>
  );
}
