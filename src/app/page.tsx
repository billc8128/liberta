import Link from "next/link";
import { connection } from "next/server";

import { HomeComposer } from "@/components/home-composer";
import { currentSession } from "@/lib/auth/session";
import { runtimeReadiness } from "@/lib/env/server";

export default async function Home() {
  await connection();
  const readiness = runtimeReadiness();
  const runtimeReady = Object.values(readiness).every(Boolean);
  const session = runtimeReady ? await currentSession() : null;

  return (
    <main className="home-shell">
      <div className="ambient-field" aria-hidden="true">
        <div className="signal-beam" />
        <div className="signal-core" />
      </div>

      <header className="home-header">
        <Link className="brand-mark" href="/" aria-label="Project L home">
          <span className="brand-glyph" aria-hidden="true" />
          <span>Project L</span>
        </Link>
        <span className="header-note">Private alpha</span>
      </header>

      <section className="home-intro" aria-labelledby="home-title">
        <p className="eyebrow">AI site maker</p>
        <h1 id="home-title">
          Make your idea
          <br />
          <span>operational.</span>
        </h1>
        <p className="intro-copy">
          Describe what you want to make. Your agent will design it, code it,
          run it, and keep refining the real site with you.
        </p>

        <HomeComposer runtimeReady={runtimeReady} signedIn={Boolean(session)} />
      </section>

      <footer className="home-footer">
        <span>One project. One agent. One live space.</span>
        <span>Design · Code · Deploy</span>
      </footer>
    </main>
  );
}
