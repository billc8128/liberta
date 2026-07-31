"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth/client";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "Creator");

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      setPending(false);
      return;
    }

    const savedPrompt = sessionStorage.getItem("project-l-prompt");
    if (savedPrompt) {
      sessionStorage.removeItem("project-l-prompt");
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: savedPrompt }),
      });
      if (response.ok) {
        const project = (await response.json()) as { projectId: string };
        router.push(`/projects/${project.projectId}`);
        return;
      }
      setError("Signed in, but the workspace could not start.");
      setPending(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="auth-panel">
      <div className="auth-tabs" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === "sign-in" ? "active" : undefined}
          onClick={() => setMode("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "sign-up" ? "active" : undefined}
          onClick={() => setMode("sign-up")}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit}>
        {mode === "sign-up" && (
          <label>
            <span>Name</span>
            <input name="name" autoComplete="name" required />
          </label>
        )}
        <label>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          <span>Password</span>
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={pending}>
          <span>{pending ? "Connecting…" : mode === "sign-in" ? "Continue" : "Create account"}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
