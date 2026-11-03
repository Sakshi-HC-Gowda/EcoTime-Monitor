import { Logo } from '@/components/ui/Logo';

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06] bg-[#070a13] py-10 md:py-12">
      <div className="landing-container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md">
          <Logo showSubtitle={false} size="md" to="/" />
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Carbon-aware scheduling for digital workloads.
          </p>
        </div>

        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} EcoTime. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
