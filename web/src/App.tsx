import { Reviews, ReviewDetail } from './pages/Reviews';
import { BusinessJobs } from './pages/BusinessJobs';
import { Preferences } from './pages/Preferences';
import {
  Building2,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Bell,
  MapPin,
  Users,
  Wallet,
  Settings2,
  CalendarDays,
  ChevronRight,
  Send,
  FolderOpen,
  UserRound,
  Activity,
} from 'lucide-react';
import { Navigate, NavLink, Outlet, Route, Routes, Link, useLocation } from 'react-router-dom';
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
  { to: '/landlords', label: 'Landlords', icon: Users },
  { to: '/reviews', label: 'Annual reviews', icon: CalendarDays },
  { to: '/contracts', label: 'Contracts', icon: FileText },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/invitations', label: 'Invitations', icon: Send },
  { to: '/documents', label: 'My documents', icon: FolderOpen },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/preferences', label: 'Preferences', icon: Settings2 },
  { to: '/profile', label: 'My profile', icon: UserRound },
  { to: '/tenants', label: 'Tenants', icon: Users },
  { to: '/delivery', label: 'Delivery status', icon: Send },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/managers', label: 'Account review', icon: Shield },
  { to: '/admin/business-jobs', label: 'Scheduled jobs', icon: Shield },
  { to: '/admin/operations', label: 'Job status', icon: Activity },
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
          '/reviews',
          '/requests',
          '/profile',
          '/notifications',
          '/documents',
          '/delivery',
        ].includes(item.to)),
  );
  const groups = [
    {
      title: 'Workspace',
      paths: ['/', '/units', '/landlords', '/tenants', '/contracts', '/expenses'],
    },
    {
      title: 'Operations',
      paths: ['/requests', '/reviews', '/invitations', '/documents', '/notifications', '/delivery'],
    },
    {
      title: 'Administration',
      paths: ['/admin/managers', '/admin/business-jobs', '/admin/operations', '/admin/audit'],
    },
    { title: 'Account', paths: ['/profile', '/preferences', '/security'] },
  ];
  return (
    <nav aria-label="Main navigation" className="space-y-6 pb-3">
      {groups.map((group) => {
        const items = links.filter((item) => group.paths.includes(item.to));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {group.title}
            </p>
            <div className="grid gap-1">
              {items.map(({ to, label, icon: Icon }) => {
                const link = (
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-300',
                        isActive
                          ? 'bg-teal-400/15 text-teal-200 shadow-[inset_3px_0_0_#2dd4bf]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <Icon className="size-[17px] shrink-0" aria-hidden="true" />
                    {label}
                  </NavLink>
                );
                return mobile ? (
                  <SheetClose asChild key={to}>
                    {link}
                  </SheetClose>
                ) : (
                  <div key={to}>{link}</div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Layout() {
  const { logout, user, logoutPending, logoutError } = useAuth();
  const location = useLocation();
  const title = navigation.find((item) => item.to === location.pathname)?.label ?? 'Record details';
  const name = user?.leasingManager?.fullName ?? user?.tenant?.fullName ?? 'Administrator';
  const role =
    user?.role === 'ADMIN'
      ? 'Administrator'
      : user?.role === 'TENANT'
        ? 'Tenant'
        : 'Leasing Manager';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
  const brand = (
    <Link
      to="/"
      className="flex items-center gap-3 px-2 text-xl font-semibold tracking-tight text-white"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-teal-400 text-slate-950">
        <Building2 className="size-6" aria-hidden="true" />
      </span>
      LeaseFlow
      <span className="self-start rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-slate-300">
        DUBAI
      </span>
    </Link>
  );
  const account = (
    <div className="shrink-0 border-t border-white/10 px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-teal-200">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{name}</p>
          <p className="text-[11px] text-slate-400">{role}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        className="w-full justify-start text-slate-300 hover:bg-white/10 hover:text-white"
        disabled={logoutPending}
        onClick={() => void logout()}
      >
        <LogOut aria-hidden="true" />
        Sign out
      </Button>
      {logoutError && (
        <p role="alert" className="mt-2 text-xs text-rose-200">
          {logoutError}
        </p>
      )}
    </div>
  );
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <a
        className="sr-only z-[100] rounded bg-white p-3 text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <aside
        style={{
          height: previewMode ? 'calc(100dvh - 48px)' : '100dvh',
          top: previewMode ? 48 : 0,
        }}
        className="hidden h-dvh flex-col bg-[#102727] px-4 pt-7 lg:sticky lg:top-0 lg:flex"
      >
        <div className="shrink-0 pb-7">{brand}</div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:#365252_transparent]">
          <Navigation />
        </div>
        {account}
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-[76px] items-center justify-between gap-3 border-b border-border/70 bg-white/90 px-4 backdrop-blur sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 lg:hidden"
                  aria-label="Open navigation"
                  title="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="top-0 bottom-auto h-dvh max-h-dvh w-[min(20rem,90vw)] gap-0 overflow-hidden border-0 bg-[#102727] text-white [&>button]:text-slate-300"
              >
                <SheetHeader className="shrink-0 px-6 pt-7 pb-6">
                  <SheetTitle className="sr-only">LeaseFlow</SheetTitle>
                  {brand}
                  <SheetDescription className="sr-only">Main navigation</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
                  <Navigation mobile />
                </div>
                <div className="shrink-0 px-4">{account}</div>
              </SheetContent>
            </Sheet>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.role === 'TENANT' ? 'My home' : 'Workspace'}
            </span>
            <ChevronRight className="hidden size-3.5 text-slate-300 sm:block" aria-hidden="true" />
            <span className="truncate text-sm font-semibold">{title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-5">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <MapPin className="size-3.5" aria-hidden="true" />
              Dubai, UAE
            </span>
            {user?.role !== 'ADMIN' && (
              <Link
                to="/notifications"
                aria-label="Open notifications"
                className="grid size-10 place-items-center rounded-full border bg-white text-muted-foreground hover:bg-accent"
              >
                <Bell className="size-[18px]" aria-hidden="true" />
              </Link>
            )}
            <Link
              to={user?.role === 'TENANT' ? '/profile' : '/preferences'}
              aria-label="Open account preferences"
              className="grid size-9 place-items-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800 ring-4 ring-teal-50/50"
            >
              {initials}
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] p-4 sm:p-7 lg:p-9">
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
              <Route path="admin/business-jobs" element={<BusinessJobs />} />
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
              <Route path="reviews" element={<Reviews />} />
              <Route path="reviews/:id" element={<ReviewDetail />} />
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
