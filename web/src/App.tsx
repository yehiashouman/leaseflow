import { Building2, FileText, Inbox, LayoutDashboard, LogOut, Menu } from 'lucide-react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Units } from './pages/Units';
import { Contracts } from './pages/Contracts';
import { Requests } from './pages/Requests';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/units', label: 'Units', icon: Building2 },
  { to: '/contracts', label: 'Contracts', icon: FileText },
  { to: '/requests', label: 'Requests', icon: Inbox },
];

function Guard() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav aria-label="Main navigation" className="grid gap-1">
      {navigation.map(({ to, label, icon: Icon }) => {
        const link = (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )
            }
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </NavLink>
        );
        return mobile ? (
          <SheetClose asChild key={to}>
            {link}
          </SheetClose>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function Layout() {
  const { logout } = useAuth();
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-8 border-r bg-card px-4 py-6 lg:flex">
        <NavLink to="/" className="flex items-center gap-2 px-3 text-lg font-semibold">
          <Building2 className="size-5 text-primary" aria-hidden="true" />
          LeaseFlow
        </NavLink>
        <Navigation />
        <Button variant="ghost" className="mt-auto justify-start" onClick={logout}>
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                  title="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>LeaseFlow</SheetTitle>
                  <SheetDescription className="sr-only">Main navigation</SheetDescription>
                </SheetHeader>
                <div className="px-4">
                  <Navigation mobile />
                </div>
                <Button
                  variant="ghost"
                  className="mx-4 mt-auto mb-4 justify-start"
                  onClick={logout}
                >
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm font-medium">Accommodation operations</span>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="units" element={<Units />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="requests" element={<Requests />} />
        </Route>
      </Route>
    </Routes>
  );
}
