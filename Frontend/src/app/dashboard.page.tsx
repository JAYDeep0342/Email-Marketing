import { useAuthStore } from '@/stores/auth.store';

/**
 * Placeholder dashboard — real dashboard with stat cards, credit meters,
 * recent campaigns comes in Phase 2. For now it just proves the auth
 * guard let us through and the layout renders.
 */
export default function DashboardPage() {
  const { user } = useAuthStore();
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </h1>
      <p className="text-muted-foreground">
        This is the customer dashboard shell. Real content lands in Phase 2.
      </p>
    </div>
  );
}
