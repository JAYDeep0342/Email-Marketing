import { Outlet, NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { LogOut } from 'lucide-react';

/**
 * Super-admin shell — placeholder. Wired up now so Step 20 (Platform
 * Admin) can drop screens in without re-plumbing routes.
 *
 * Uses the same visual language as AppLayout but a distinct nav set. In
 * production a small "Admin area" banner on the top bar makes the
 * context switch obvious.
 */
export default function AdminLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 flex-col border-r border-border bg-card px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="h-6 w-6 rounded-md bg-primary" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <nav className="space-y-1 text-sm">
          <SidebarLink to="/admin">Dashboard</SidebarLink>
          <SidebarLink to="/admin/customers">Customers</SidebarLink>
          <SidebarLink to="/admin/plans">Plans</SidebarLink>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="text-sm text-muted-foreground">
            Admin area · {user?.email}
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/admin'}
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
