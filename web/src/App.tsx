import { Preferences } from './pages/Preferences';
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
import { DeliveryStatus } from './pages/DeliveryStatus';
import { Expenses, ExpenseDetail } from './pages/Expenses';
import { Operations } from './pages/Operations';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Units } from './pages/Units';
import { Contracts } from './pages/Contracts';
import { ContractDetail } from './pages/ContractDetail';
import { Requests } from './pages/Requests';
import { RequestDetail } from './pages/RequestDetail';
import { Landlords } from './pages/Landlords';
import { LandlordDetail } from './pages/LandlordDetail';
import { UnitDetail } from './pages/UnitDetail';
import { PreviewBanner } from './components/preview-banner';
import { previewMode, type Role } from './session';
import { QueryFeedback } from './components/query-feedback';
import { Security } from './pages/Security';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Managers, ManagerDetail, AdminAudit } from './pages/Managers';
import { Profile } from './pages/Profile';
import { Tenants, TenantDetail } from './pages/Tenants';
import { Account } from './pages/Account';
import { AccountInvitations } from './pages/Invitations';
import { MyDocuments } from './pages/Documents';
import { Notifications } from './pages/Notifications';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/units', label: 'Units', icon: Building2 },
  { to: '/landlords', label: 'Landlords', icon: Building2 },
  { to: '/contracts', label: 'Contracts', icon: FileText },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/expenses', label: 'Expenses', icon: FileText },
  { to: '/invitations', label: 'Invitations', icon: Inbox },
  { to: '/documents', label: 'My documents', icon: FileText },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/preferences', label: 'Preferences', icon: Shield },
  { to: '/profile', label: 'My profile', icon: Shield },
  { to: '/tenants', label: 'Tenants', icon: Building2 },
  { to: '/delivery', label: 'Delivery status', icon: Inbox },
  { to: '/notifications', label: 'Notifications', icon: Inbox },
  { to: '/admin/managers', label: 'Account review', icon: Shield },
  { to: '/admin/operations', label: 'Job status', icon: Shield },
  { to: '/admin/audit', label: 'Audit history', icon: FileText },
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
      item.to === '/preferences' ||
      (user?.role === 'ADMIN' && item.to.startsWith('/admin/')) ||
      (user?.role === 'LEASING_MANAGER' &&
        !item.to.startsWith('/admin/') &&
        item.to !== '/profile') ||
      (user?.role === 'TENANT' &&
        [
          '/contracts',
          '/requests',
          '/profile',
          '/notifications',
          '/documents',
          '/delivery',
        ].includes(item.to)),
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
        <Route path="/register" element={<Account key="register" mode="register" />} />
        <Route path="/account-setup" element={<Account key="setup" mode="setup" />} />
        <Route path="/forgot-password" element={<Account key="forgot" mode="forgot" />} />
        <Route path="/reset-password" element={<Account key="reset" mode="reset" />} />
        <Route path="/verify-email" element={<Account key="verify" mode="verify" />} />
        <Route path="/invitation" element={<Account key="invitation" mode="invitation" />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Guard />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="security" element={<Security />} />
            <Route path="preferences" element={<Preferences />} />
            <Route element={<Guard roles={['ADMIN']} />}>
              <Route path="admin/managers" element={<Managers />} />
              <Route path="admin/managers/:id" element={<ManagerDetail />} />
              <Route path="admin/operations" element={<Operations />} />
              <Route path="admin/audit" element={<AdminAudit />} />
            </Route>
            <Route element={<Guard roles={['LEASING_MANAGER']} />}>
              <Route path="expenses" element={<Expenses />} />
              <Route path="expenses/:id" element={<ExpenseDetail />} />
              <Route path="invitations" element={<AccountInvitations />} />
              <Route path="tenants" element={<Tenants />} />
              <Route path="tenants/:id" element={<TenantDetail />} />
              <Route path="units" element={<Units />} />
              <Route path="units/:id" element={<UnitDetail />} />
              <Route path="landlords" element={<Landlords />} />
              <Route path="landlords/:id" element={<LandlordDetail />} />
            </Route>
            <Route element={<Guard roles={['LEASING_MANAGER', 'TENANT']} />}>
              <Route path="documents" element={<MyDocuments />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="delivery" element={<DeliveryStatus />} />
              <Route path="contracts" element={<Contracts />} />
              <Route path="contracts/:id" element={<ContractDetail />} />
              <Route path="requests" element={<Requests />} />
              <Route path="requests/:id" element={<RequestDetail />} />
            </Route>
            <Route element={<Guard roles={['TENANT']} />}>
              <Route path="profile" element={<Profile />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  );
}
