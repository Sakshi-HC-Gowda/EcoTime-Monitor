import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/features/auth/AuthProvider';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email, password);
      navigate('/dashboard');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!firstName || !lastName || !email || !password || !organizationName) {
      setError('Please complete all onboarding fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      await register({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        organization_name: organizationName,
      });
      navigate('/dashboard');
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a13] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f172a] p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8 text-center">
          <Logo size="lg" to="/" />
          <h1 className="mt-6 text-2xl font-bold text-white">
            {mode === 'login' ? 'Welcome Back' : 'Create Your Organization'}
          </h1>
          <p className="mt-1.5 text-xs text-slate-400">
            {mode === 'login'
              ? 'Sign in to access your EcoTime dashboard'
              : 'Set up your tenant and admin account'}
          </p>
        </div>

        <div className="mb-5 flex rounded-xl border border-white/10 bg-[#111827] p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-green-500 text-white' : 'text-slate-300'}`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-green-500 text-white' : 'text-slate-300'}`}
          >
            Register
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
              />
            </div>

            {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm text-slate-300">First name</label>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Last name</label>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Organization name</label>
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
              />
            </div>

            {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating organization...' : 'Create organization'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}