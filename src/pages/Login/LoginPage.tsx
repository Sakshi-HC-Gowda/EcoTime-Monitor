import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    // Demo Login
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#070a13] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f172a] p-8 shadow-2xl">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 text-center">
          <Logo size="lg" to="/" />

          <h1 className="mt-6 text-2xl font-bold text-white">
            Welcome Back
          </h1>

          <p className="mt-1.5 text-xs text-slate-400">
            Sign in to access your EcoTime dashboard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Email
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-green-500"
            />
          </div>

          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>

        {/* Demo */}
        <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-4">

          <p className="text-xs text-green-300 text-center">
            Demo Mode
          </p>

          <p className="mt-2 text-center text-sm text-slate-400">
            Authentication is simulated for project demonstration.
          </p>

          <Button
            className="mt-4 w-full"
            variant="secondary"
            onClick={() => navigate("/dashboard")}
          >
            Continue as Demo
          </Button>

        </div>

      </div>
    </div>
  );
}