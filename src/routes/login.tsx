import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CallsignForm } from "@/components/callsign-form";
import { authEnabled } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm border border-line bg-surface p-6">
        <p className="font-mono text-xs tracking-widest text-signal">COLO 3 · NIGHT SHIFT</p>
        <h1 className="mt-2 font-mono text-3xl font-semibold tracking-tight">RACKDOWN</h1>
        <div className="mt-5">
          {authEnabled ? (
            <CallsignForm onDone={() => void navigate({ to: "/" })} />
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
        <Link to="/" className="mt-5 block text-center font-mono text-sm text-muted">
          Back to the hall
        </Link>
      </div>
    </main>
  );
}
