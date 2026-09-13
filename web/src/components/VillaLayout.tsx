import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { VillaProvider, useVilla } from '../context/VillaContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useRealtime } from '../lib/useRealtime.ts';
import { Avatar, Spinner } from './ui.tsx';
import { NotificationBell } from './NotificationBell.tsx';
import {
  IconChevronDown,
  IconDashboard,
  IconExpenses,
  IconLeave,
  IconMenu,
  IconMessages,
  IconPeople,
  IconRoles,
  IconRoster,
  IconSettings,
  IconTasks,
  type IconProps,
} from './icons.tsx';

export function VillaLayout() {
  const { villaId } = useParams<{ villaId: string }>();
  useRealtime(villaId);

  return (
    <VillaProvider
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner label="Opening villa" />
        </div>
      }
    >
      <LayoutChrome />
    </VillaProvider>
  );
}

type NavItem = {
  to: string;
  label: string;
  Icon: (props: IconProps) => JSX.Element;
  visible: boolean;
  end?: boolean;
};

function LayoutChrome() {
  const { villa, can, role } = useVilla();
  const { user, villas, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes, so a tap on a link does not
  // leave the menu covering the screen it just opened.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // While the drawer is open it is the only thing on screen; letting the page
  // behind it scroll makes the app feel unfinished.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const base = `/villas/${villa.id}`;
  // Navigation mirrors permissions: a link only appears when the API behind it
  // would actually answer, so nobody is walked into a 403.
  const navigation: NavItem[] = [
    { to: base, label: 'Dashboard', Icon: IconDashboard, visible: true, end: true },
    { to: `${base}/tasks`, label: 'Tasks', Icon: IconTasks, visible: can('tasks:view.all', 'tasks:view.own') },
    { to: `${base}/roster`, label: 'Roster', Icon: IconRoster, visible: can('roster:view.all', 'roster:view.own') },
    { to: `${base}/leave`, label: 'Leave', Icon: IconLeave, visible: can('leave:view.all', 'leave:view.own') },
    { to: `${base}/expenses`, label: 'Expenses', Icon: IconExpenses, visible: can('expenses:view.all', 'expenses:view.own') },
    { to: `${base}/messages`, label: 'Messages', Icon: IconMessages, visible: can('messages:read') },
    { to: `${base}/people`, label: 'People', Icon: IconPeople, visible: can('members:view') },
    { to: `${base}/roles`, label: 'Roles & permissions', Icon: IconRoles, visible: can('roles:manage') },
    { to: `${base}/settings`, label: 'Settings', Icon: IconSettings, visible: can('villa:manage') },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen lg:flex">
      <aside
        id="villa-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] max-w-[85vw] transform flex-col border-r border-sand-200 bg-white transition-transform duration-200 ease-out lg:static lg:w-64 lg:max-w-none lg:translate-x-0 ${
          menuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full shadow-none'
        }`}
        aria-label="Villa sections"
      >
        <div className="border-b border-sand-200 px-4 py-4">
          <VillaSwitcher current={villa} villas={villas} />
          <p className="mt-1.5 px-1 text-xs text-slate-500">Signed in as {role.name}</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-slate-600 hover:bg-sand-100 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.Icon size={19} className={isActive ? 'text-brand-700' : 'text-slate-400'} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sand-200 p-3">
          <Link
            to="/account"
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 hover:bg-sand-100"
          >
            <Avatar name={user?.fullName ?? ''} colour={user?.avatarColour} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{user?.fullName}</span>
              <span className="block truncate text-xs text-slate-500">{user?.email}</span>
            </span>
          </Link>
          <button
            type="button"
            className="mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-sand-100"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-sand-200 bg-sand-50/90 px-3 py-2.5 backdrop-blur lg:px-8 lg:py-3">
          <button
            type="button"
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-sand-100 lg:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="villa-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <IconMenu size={22} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 lg:text-base">
            {villa.name}
          </h1>
          <NotificationBell />
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function VillaSwitcher({
  current,
  villas,
}: {
  current: { id: string; name: string };
  villas: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);

  if (villas.length <= 1) {
    return <p className="px-1 text-base font-semibold text-slate-900">{current.name}</p>;
  }
  return (
    <div className="relative">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-sand-100"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="truncate text-base font-semibold text-slate-900">{current.name}</span>
        <IconChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close villa list"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-sand-200 bg-white shadow-lg">
            {villas.map((villa) => (
              <Link
                key={villa.id}
                to={`/villas/${villa.id}`}
                onClick={() => setOpen(false)}
                className={`block truncate px-3 py-2.5 text-sm hover:bg-sand-100 ${
                  villa.id === current.id ? 'font-medium text-brand-800' : 'text-slate-700'
                }`}
              >
                {villa.name}
              </Link>
            ))}
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="block border-t border-sand-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-sand-100"
            >
              All villas
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
