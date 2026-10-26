
import { useState } from 'react';
import type { FormEvent } from 'react';
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

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email, password);
      navigate('/dashboard');
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Login failed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !password ||
      !organizationName.trim()
    ) {
      setError('Please complete all onboarding fields.');
      return;
    }

    try {
      setIsSubmitting(true);

      await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        organization_name: organizationName.trim(),
      });

      navigate('/dashboard');
    } catch (registerError) {
      setError(
        registerError instanceof Error
          ? registerError.message
          : 'Registration failed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName =
    'h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-white outline-none transition-colors focus:border-green-500/50 focus:bg-black/40';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a13] px-6">
      <div className="w-full max-w-[440px] rounded-[24px] border border-white/[0.05] bg-[#0f172a]/90 p-8 shadow-2xl backdrop-blur-xl sm:p-10">

        {/* Logo and Heading */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo size="lg" to="/" />

          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {mode === 'login'
              ? 'Welcome Back'
              : 'Create Your Organization'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === 'login'
              ? 'Sign in to access your EcoTime dashboard'
              : 'Set up your tenant and admin account'}
          </p>
        </div>

        <div className="mb-6 flex rounded-xl border border-white/[0.08] bg-black/20 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
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
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'register'
                ? 'bg-green-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </div>
        )}

        {/* Login Form */}
        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="login-email"
                className="text-sm font-semibold text-slate-300"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="login-password"
                className="text-sm font-semibold text-slate-300"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClassName}
                required
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
          /* Registration Form */
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="register-first-name"
                  className="text-sm font-semibold text-slate-300"
                >
                  First name
                </label>
                <input
                  id="register-first-name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className={inputClassName}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="register-last-name"
                  className="text-sm font-semibold text-slate-300"
                >
                  Last name
                </label>
                <input
                  id="register-last-name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className={inputClassName}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="register-organization"
                className="text-sm font-semibold text-slate-300"
              >
                Organization name
              </label>
              <input
                id="register-organization"
                type="text"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="register-email"
                className="text-sm font-semibold text-slate-300"
              >
                Email
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="register-password"
                className="text-sm font-semibold text-slate-300"
              >
                Password
              </label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                placeholder="Create a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <Button
              type="submit"
              className="mt-2 h-[52px] w-full text-base font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Creating organization...'
                : 'Create organization'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
