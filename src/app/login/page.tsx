import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthForm } from "@/components/auth-form";
import {
  MarketingThemeProvider,
  MarketingThemeSwitch,
} from "@/components/marketing-theme";
import { currentSession } from "@/lib/auth/session";

export default async function LoginPage() {
  await connection();
  if (await currentSession()) redirect("/");

  return (
    <MarketingThemeProvider>
      <main className="auth-shell">
        <header className="home-header">
          <Link className="brand-mark" href="/" aria-label="Project L home">
            <span className="brand-glyph" aria-hidden="true" />
            <span>Project L</span>
          </Link>
          <div className="auth-header-actions">
            <MarketingThemeSwitch />
            <span className="header-note">Creator access</span>
          </div>
        </header>
        <section className="auth-content">
          <div className="auth-intro">
            <p className="eyebrow">Your project space</p>
            <h1>
              <span className="auth-title-machine">
                Enter the<br /><em>machine.</em>
              </span>
              <span className="auth-title-portrait">
                Keep<br /><em>making.</em>
              </span>
            </h1>
            <p className="intro-copy">
              Your projects, conversations, code, and live environments stay together.
            </p>
          </div>
          <AuthForm />
        </section>
      </main>
    </MarketingThemeProvider>
  );
}
