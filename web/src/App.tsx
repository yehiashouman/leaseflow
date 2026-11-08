import { Building2, FileText, Inbox, LayoutDashboard, LogOut, Menu, Shield } from 'lucide-react';
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
import { Landlords } from './pages/Landlords';
import { UnitDetail } from './pages/UnitDetail';
import { PreviewBanner } from './components/preview-banner';
import { previewMode, type Role } from './session';
import { QueryFeedback } from './components/query-feedback';
import { Security } from './pages/Security';
import { Alert, AlertDescription } from '@/components/ui/alert';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/units', label: 'Units', icon: Building2 },
  { to: '/landlords', label: 'Landlords', icon: Building2 },
  { to: '/contracts', label: 'Contracts', icon: FileText },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/security', label: 'Security', icon: Shield },
];

function Guard({ roles }: { roles?: Role[] }) {
  const { token, user, pending } = useAuth();
  if (pending)
    return (
      <div className="p-8">
        <QueryFeedback pending onRetry={() => {}} />
      </div>
    );
  if (!token || !user) return <Navigate to="/login" replace />;
  return roles && !roles.includes(user.role) ? <Navigate to="/" replace /> : <Outlet />;
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuth();
  const links = navigation.filter(
    (item) =>
      item.to === '/' ||
      item.to === '/security' ||
      user?.role === 'LEASING_MANAGER' ||
      (user?.role === 'TENANT' && ['/contracts', '/requests'].includes(item.to)),
  );
  return (
    <nav aria-label="Main navigation" className="grid gap-1">
      {links.map(({ to, label, icon: Icon }) => {
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
  const { logout, user, logoutPending, logoutError } = useAuth();
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-8 border-r bg-card px-4 py-6 lg:flex">
        <NavLink to="/" className="flex items-center gap-2 px-3 text-lg font-semibold">
          <Building2 className="size-5 text-primary" aria-hidden="true" />
          LeaseFlow
        </NavLink>
        <Navigation />
        <Button
          variant="ghost"
          className="mt-auto justify-start"
          disabled={logoutPending}
          onClick={() => void logout()}
        >
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
                  disabled={logoutPending}
                  onClick={() => void logout()}
                >
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm font-medium">
              {user?.role === 'ADMIN'
                ? 'Platform administration'
                : user?.role === 'TENANT'
                  ? 'Tenant portal'
                  : 'Accommodation operations'}
            </span>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {logoutError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{logoutError}</AlertDescription>
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      {previewMode && <PreviewBanner />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Guard />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="security" element={<Security />} />
            <Route element={<Guard roles={['LEASING_MANAGER']} />}>
              <Route path="units" element={<Units />} />
              <Route path="units/:id" element={<UnitDetail />} />
              <Route path="landlords" element={<Landlords />} />
            </Route>
            <Route element={<Guard roles={['LEASING_MANAGER', 'TENANT']} />}>
              <Route path="contracts" element={<Contracts />} />
              <Route path="requests" element={<Requests />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  );
}
