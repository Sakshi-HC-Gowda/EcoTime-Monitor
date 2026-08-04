import { Link } from 'react-router-dom';
import { Leaf, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#workflow', label: 'How it Works' },
  { href: '#dashboard-preview', label: 'Preview' },
];

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#070a13]/88 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="landing-container h-16 md:h-20 flex items-center justify-between gap-4 md:gap-6">
        <Link to="/" className="flex items-center gap-3 group min-w-0">
          <div className="h-10 w-10 rounded-[var(--radius-card)] bg-gradient-to-br from-green-500 to-teal-400 p-px shadow-lg shadow-green-500/20 group-hover:scale-105 transition-transform duration-[var(--duration-normal)] flex-shrink-0">
            <div className="flex h-full w-full items-center justify-center rounded-[var(--radius-card)] bg-[#070a13]">
              <Leaf className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              EcoTime
              <span className="ds-badge bg-green-500/10 text-green-400 border-green-500/20 px-2 py-0.5">
                v2.0
              </span>
            </span>
            <span className="text-xs text-slate-400 font-medium hidden sm:block">Carbon-Aware Scheduling</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-[var(--space-8)] text-sm font-medium text-slate-300">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors duration-[var(--duration-fast)] hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
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
