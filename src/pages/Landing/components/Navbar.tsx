import { useEffect, useId, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#workflow', label: 'How it Works' },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 overflow-x-hidden border-b border-white/[0.06] bg-[#070a13]/88 backdrop-blur-xl">
      <div className="landing-container flex h-16 min-w-0 items-center justify-between gap-3 md:h-20 md:gap-4">
        <Logo showSubtitle={false} size="md" to="/" className="min-w-0" />

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 lg:flex" aria-label="Landing">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-1 py-1 transition-colors duration-[var(--duration-fast)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070a13]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <Button to="/login" variant="ghost" size="sm" className="shrink-0">
              Sign In
            </Button>
            <Button
              to="/login?mode=register"
              size="sm"
              className="shrink-0"
              iconRight={<ArrowRight />}
            >
              Get Started
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <div
          id={menuId}
          className="border-t border-white/[0.06] bg-[#070a13] lg:hidden"
        >
          <nav className="landing-container flex flex-col gap-1 py-4" aria-label="Mobile landing">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 sm:hidden">
              <Button to="/login" variant="ghost" size="sm" fullWidth onClick={closeMenu}>
                Sign In
              </Button>
              <Button
                to="/login?mode=register"
                size="sm"
                fullWidth
                iconRight={<ArrowRight />}
                onClick={closeMenu}
              >
                Get Started
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
