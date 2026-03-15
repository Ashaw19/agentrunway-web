const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function MembersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Sk className="h-8 w-48" />
        <Sk className="h-4 w-64" />
      </div>
      <Sk className="h-20" />
      <Sk className="h-64" />
    </div>
  );
}
