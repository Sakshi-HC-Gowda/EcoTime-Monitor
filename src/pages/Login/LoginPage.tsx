import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf } from "lucide-react";

import { Button } from "@/components/ui/Button";

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
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500 to-teal-400 p-[1px]">
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-[#070a13]">
              <Leaf className="h-7 w-7 text-green-400" />
            </div>
          </div>

          <h1 className="mt-4 text-3xl font-bold text-white">
            Welcome Back
          </h1>

          <p className="mt-2 text-sm text-slate-400">
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