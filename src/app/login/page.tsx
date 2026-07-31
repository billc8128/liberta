import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthForm } from "@/components/auth-form";
import { currentSession } from "@/lib/auth/session";

export default async function LoginPage() {
  await connection();
  if (await currentSession()) redirect("/");

  return (
    <main className="auth-shell">
      <header className="home-header">
        <Link className="brand-mark" href="/" aria-label="Project L home">
          <span className="brand-glyph" aria-hidden="true" />
          <span>Project L</span>
        </Link>
        <span className="header-note">Creator access</span>
      </header>
      <section className="auth-content">
        <div>
          <p className="eyebrow">Your project space</p>
          <h1>Enter the<br /><span>machine.</span></h1>
          <p className="intro-copy">
            Your projects, conversations, code, and live environments stay together.
          </p>
        </div>
        <AuthForm />
      </section>
    </main>
  );
}
