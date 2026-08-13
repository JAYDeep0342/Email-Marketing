import { Outlet, NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { LogOut } from 'lucide-react';

/**
 * Customer app shell — sidebar + top bar + main outlet.
 *
 * Chunk 3 version is a placeholder just to prove routing + guards work
 * end-to-end. Chunk 4 replaces the sidebar with the real nav from the
 * design guide, adds the trial banner, and installs the user menu.
 */
export default function AppLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-56 flex-col border-r border-border bg-card px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="h-6 w-6 rounded-md bg-primary" />
          <span className="text-sm font-semibold">Email Marketing</span>
        </div>
        <nav className="space-y-1 text-sm">
          <SidebarLink to="/app">Dashboard</SidebarLink>
          <SidebarLink to="/app/contacts">Contacts</SidebarLink>
          <SidebarLink to="/app/campaigns">Campaigns</SidebarLink>
          <SidebarLink to="/app/templates">Templates</SidebarLink>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="text-sm text-muted-foreground">
            {user ? `Signed in as ${user.email}` : ''}
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
      end={to === '/app'}
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
