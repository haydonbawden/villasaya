import type { ReactNode } from 'react';

/** Split layout shared by sign-in, sign-up and invitation acceptance. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden bg-brand-800 lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #2dd4bf 0, transparent 45%), radial-gradient(circle at 80% 70%, #b8946a 0, transparent 45%)',
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-200">
            Villa Staff Manager
          </span>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight text-white">
            Rosters, leave, expense claims and your whole team — in one workspace per villa.
          </p>
          <p className="mt-4 text-brand-100">
            Built for villa owners in Bali who want to stop running the property from a group chat and a
            notebook.
          </p>
        </div>
        <p className="relative text-xs text-brand-200/80">
          Each villa is its own workspace. You decide exactly what every role can see and do.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-sm font-semibold uppercase tracking-widest text-brand-700">
              Villa Staff Manager
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
