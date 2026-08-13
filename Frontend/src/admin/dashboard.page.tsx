/**
 * Placeholder super-admin dashboard. Right now this page is unreachable
 * because RequirePlatformAdmin always redirects (backend doesn't emit
 * isPlatformAdmin yet — that's a Step 20 feature). Wired up so the route
 * shape exists.
 */
export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        Platform Dashboard
      </h1>
      <p className="text-muted-foreground">
        Super-admin surface. Real screens land after Step 20 (Platform Admin
        backend).
      </p>
    </div>
  );
}
