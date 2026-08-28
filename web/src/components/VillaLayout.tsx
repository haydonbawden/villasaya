import { useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { VillaProvider, useVilla } from '../context/VillaContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useRealtime } from '../lib/useRealtime.ts';
import { Avatar, Spinner } from './ui.tsx';
import { NotificationBell } from './NotificationBell.tsx';

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

type NavItem = { to: string; label: string; icon: string; visible: boolean; end?: boolean };

function LayoutChrome() {
  const { villa, can, role } = useVilla();
  const { user, villas, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const base = `/villas/${villa.id}`;
  // Navigation mirrors permissions: a link is only rendered when the API behind
  // it would actually answer, so nobody is walked into a 403.
  const navigation: NavItem[] = [
    { to: base, label: 'Dashboard', icon: '◈', visible: true, end: true },
    { to: `${base}/tasks`, label: 'Tasks', icon: '☑', visible: can('tasks:view.all', 'tasks:view.own') },
    { to: `${base}/roster`, label: 'Roster', icon: '🗓', visible: can('roster:view.all', 'roster:view.own') },
    { to: `${base}/leave`, label: 'Leave', icon: '⛱', visible: can('leave:view.all', 'leave:view.own') },
    { to: `${base}/expenses`, label: 'Expenses', icon: '₪', visible: can('expenses:view.all', 'expenses:view.own') },
    { to: `${base}/messages`, label: 'Messages', icon: '💬', visible: can('messages:read') },
    { to: `${base}/people`, label: 'People', icon: '👥', visible: can('members:view') },
    { to: `${base}/roles`, label: 'Roles & permissions', icon: '🔑', visible: can('roles:manage') },
    { to: `${base}/settings`, label: 'Settings', icon: '⚙', visible: can('villa:manage') },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar: a drawer on small screens, permanent from lg up. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-sand-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-sand-200 px-4 py-4">
            <VillaSwitcher current={villa} villas={villas} />
            <p className="mt-2 px-1 text-xs text-slate-500">Signed in as {role.name}</p>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-sand-100 hover:text-slate-900'
                  }`
                }
              >
                <span aria-hidden="true" className="w-4 text-center text-base leading-none">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-sand-200 p-3">
            <NavLink
              to="/account"
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sand-100"
              onClick={() => setMenuOpen(false)}
            >
              <Avatar name={user?.fullName ?? ''} colour={user?.avatarColour} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{user?.fullName}</span>
                <span className="block truncate text-xs text-slate-500">{user?.email}</span>
              </span>
            </NavLink>
            <button
              type="button"
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-sand-100"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sand-200 bg-sand-50/90 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            className="btn-ghost px-2 lg:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 lg:text-base">{villa.name}</h1>
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
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-sand-100"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="truncate text-base font-semibold text-slate-900">{current.name}</span>
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-sand-200 bg-white shadow-lg">
          {villas.map((villa) => (
            <a
              key={villa.id}
              href={`/villas/${villa.id}`}
              className={`block truncate px-3 py-2 text-sm hover:bg-sand-100 ${
                villa.id === current.id ? 'font-medium text-brand-800' : 'text-slate-700'
              }`}
            >
              {villa.name}
            </a>
          ))}
          <a href="/" className="block border-t border-sand-200 px-3 py-2 text-sm text-slate-600 hover:bg-sand-100">
            All villas
          </a>
        </div>
      )}
    </div>
  );
}
