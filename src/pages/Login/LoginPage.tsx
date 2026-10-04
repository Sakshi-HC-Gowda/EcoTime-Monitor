import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { AUTH_STORAGE_KEY } from '@/components/auth/AuthGuard';

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const completeAuth = () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      'true'
    );

    navigate('/dashboard');
  };

  const handleLogin = (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    completeAuth();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a13] px-6">
      <div className="w-full max-w-[440px] rounded-[24px] border border-white/[0.05] bg-[#0f172a]/90 backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo
            size="lg"
            to="/"
          />

          <h1 className="mt-8 text-2xl font-extrabold text-white sm:text-3xl tracking-tight">
            Welcome Back
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Sign in to access your EcoTime dashboard
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-300">
              Email
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-white outline-none transition-colors focus:border-green-500/50 focus:bg-black/40"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-300">
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-white outline-none transition-colors focus:border-green-500/50 focus:bg-black/40"
            />
          </div>

          <Button
            type="submit"
            className="mt-2 h-[52px] w-full text-base font-bold"
          >
            Sign In
          </Button>
        </form>

        {/* Demo */}
        <div className="mt-8 rounded-2xl border border-green-500/10 bg-green-500/5 p-5">
          <div className="flex flex-col items-center text-center">
            <span className="mb-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-400">
              Demo Mode
            </span>

            <p className="mb-4 text-xs text-slate-400">
              Authentication is simulated for project demonstration.
            </p>

            <Button
              className="h-11 w-full text-sm font-semibold"
              variant="secondary"
              onClick={completeAuth}
            >
              Continue as Demo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;