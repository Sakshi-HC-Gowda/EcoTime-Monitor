import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#workflow', label: 'How it Works' },
  // { href: '#dashboard-preview', label: 'Preview' },
];

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#070a13]/88 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="landing-container h-16 md:h-20 flex items-center justify-between gap-4 md:gap-6">
        <Logo showSubtitle size="md" to="/" />

        <nav className="hidden md:flex items-center gap-[var(--space-8)] text-sm font-medium text-slate-300">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors duration-[var(--duration-fast)] hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Button
            to="/dashboard"
            variant="ghost"
            size="sm"
          >
            Sign In
          </Button>

          <Button
            to="/dashboard"
            size="sm"
            iconRight={<ArrowRight className="w-4 h-4" />}
          >
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
}
