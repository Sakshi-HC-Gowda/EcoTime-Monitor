
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/features/auth/AuthProvider';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'join'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
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
      (mode === 'register' ? !organizationName.trim() : !invitationCode.trim())
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
        ...(mode === 'register'
          ? { organization_name: organizationName.trim() }
          : { invitation_code: invitationCode.trim() }),
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

  const inputClassName = 'ds-input bg-black/20';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a13] px-6">
      <div className="w-full max-w-[440px] rounded-[24px] border border-white/[0.05] bg-[#0f172a]/90 p-8 shadow-2xl backdrop-blur-xl sm:p-10">

        {/* Logo and Heading */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo size="lg" to="/" />

          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {mode === 'login'
              ? 'Welcome Back'
              : mode === 'join'
                ? 'Join Your Organization'
                : 'Create Your Organization'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === 'login'
              ? 'Sign in to access your EcoTime dashboard'
              : mode === 'join'
                ? 'Use an invitation code from an organization admin'
                : 'Set up your tenant and admin account'}
          </p>
        </div>

        <div className="segment-control mb-6 w-full">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`segment-tab flex-1 ${mode === 'login' ? 'active' : ''}`}
            aria-pressed={mode === 'login'}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`segment-tab flex-1 ${mode === 'register' ? 'active' : ''}`}
            aria-pressed={mode === 'register'}
          >
            Create Organization
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('join');
              setError('');
            }}
            className={`segment-tab flex-1 ${mode === 'join' ? 'active' : ''}`}
            aria-pressed={mode === 'join'}
          >
            Join Existing
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

            {mode === 'register' ? (
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
            ) : (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="register-invitation-code"
                  className="text-sm font-semibold text-slate-300"
                >
                  Invitation code
                </label>
                <input
                  id="register-invitation-code"
                  type="text"
                  autoComplete="one-time-code"
                  placeholder="Paste the code from your admin"
                  value={invitationCode}
                  onChange={(event) => setInvitationCode(event.target.value)}
                  className={inputClassName}
                  required
                />
              </div>
            )}

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
                ? mode === 'join' ? 'Joining organization...' : 'Creating organization...'
                : mode === 'join' ? 'Join organization' : 'Create organization'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
