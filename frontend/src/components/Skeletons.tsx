export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-toss-bg">
      <header className="bg-toss-card border-b border-toss-border px-5 pt-4 pb-5">
        <div className="max-w-7xl mx-auto">
          <div className="skeleton h-4 w-32 mb-5" />
          <div className="skeleton h-12 w-56 mb-2" />
          <div className="skeleton h-3 w-40 mb-4" />
          <div className="flex gap-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-24 ml-auto" />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border p-5">
          <div className="skeleton h-4 w-24 mb-3" />
          <div className="skeleton h-[200px] w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border p-5">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-[200px] w-full rounded-full mx-auto" style={{ maxWidth: 200 }} />
          </div>
          <div className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border p-5">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-[200px] w-full rounded-full mx-auto" style={{ maxWidth: 200 }} />
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-toss-card rounded-[var(--radius-toss-lg)] border border-toss-border p-5">
            <div className="skeleton h-5 w-40 mb-2" />
            <div className="skeleton h-4 w-32" />
          </div>
        ))}
      </main>
    </div>
  );
}
