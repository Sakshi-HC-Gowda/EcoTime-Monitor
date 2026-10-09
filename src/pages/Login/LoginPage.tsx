import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/features/auth/AuthProvider';

export function LoginPage() {
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

  // Shared input styling from ui-update branch
  const inputClassName =
    'h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-white outline-none transition-colors focus:border-green-500/50 focus:bg-black/40';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a13] px-6">
      <div className="w-full max-w-[440px] rounded-[24px] border border-white/[0.05] bg-[#0f172a]/90 backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo size="lg" to="/" />

          <h1 className="mt-8 text-2xl font-extrabold text-white sm:text-3xl tracking-tight">
            {mode === 'login' ? 'Welcome Back' : 'Create Your Organization'}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {mode === 'login'
              ? 'Sign in to access your EcoTime dashboard'
              : 'Set up your tenant and admin account'}
          </p>
        </div>

        {/* Login / Register Toggle */}
        <div className="mb-6 flex rounded-xl border border-white/[0.08] bg-black/20 p-1">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'login'
                ? 'bg-green-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'register'
                ? 'bg-green-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
              />
            </div>

            <Button
              type="submit"
              className="mt-2 h-[52px] w-full text-base font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-300">First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClassName}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-300">Last name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClassName}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300">Organization name</label>
              <input
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-300">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
              />
            </div>

            <Button
              type="submit"
              className="mt-2 h-[52px] w-full text-base font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating organization...' : 'Create organization'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginPage;