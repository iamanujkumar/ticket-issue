import { Link, NavLink, useRouteError } from 'react-router';
import { TICKET_PRIORITY, TICKET_STATUS, label } from './format.js';

const NAV_BY_ROLE = {
  AUTHOR: [
    { to: '/books', label: 'My Books' },
    { to: '/tickets', label: 'My Tickets', end: true },
    { to: '/tickets/new', label: 'New Ticket' },
  ],
  ADMIN: [{ to: '/admin', label: 'Ticket Queue' }],
};

const BUTTON_STYLES = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
};

const BADGE_TONES = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
};

const STATUS_TONES = {
  OPEN: 'blue',
  IN_PROGRESS: 'amber',
  RESOLVED: 'green',
  CLOSED: 'gray',
};

const PRIORITY_TONES = {
  CRITICAL: 'red',
  HIGH: 'amber',
  MEDIUM: 'blue',
  LOW: 'gray',
};

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600';

export function Layout({ user, onLogout, isLoggingOut, children }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="font-semibold text-emerald-800">
            BookLeaf Support
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV_BY_ROLE[user.role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'font-medium text-emerald-800' : 'text-slate-600 hover:text-slate-900')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-600">{user.name}</span>
            <Button variant="secondary" onClick={onLogout} disabled={isLoggingOut}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export function PageTitle({ title, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, error, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-red-700">{error}</span>}
    </label>
  );
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status]}>{label(TICKET_STATUS, status)}</Badge>;
}

export function PriorityBadge({ priority }) {
  return <Badge tone={PRIORITY_TONES[priority]}>{label(TICKET_PRIORITY, priority)}</Badge>;
}

export function SlaBadge({ ticket }) {
  if (ticket.isOverdue) {
    return <Badge tone="red">Overdue</Badge>;
  }
  if (ticket.isDueSoon) {
    return <Badge tone="amber">Due soon</Badge>;
  }
  return null;
}

export function Pagination({ meta, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  if (pageCount === 1) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
        Previous
      </Button>
      <span className="text-slate-600">
        Page {meta.page} of {pageCount}
      </span>
      <Button variant="secondary" disabled={meta.page >= pageCount} onClick={() => onPageChange(meta.page + 1)}>
        Next
      </Button>
    </div>
  );
}

export function Card({ className = '', children }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>{children}</div>;
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
}

export function Empty({ children }) {
  return <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">{children}</p>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {error?.requestId && <p className="mt-1 text-xs text-red-600">Reference: {error.requestId}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-slate-600">Please reload. If it keeps happening, tell the BookLeaf team.</p>
      {error?.message && <p className="mt-2 text-xs text-slate-500">{error.message}</p>}
      <Button className="mt-4" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-3 inline-block text-sm text-emerald-800 underline">
        Go to home
      </Link>
    </div>
  );
}
