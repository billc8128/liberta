import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { connection } from "next/server";

import { HomeComposer } from "@/components/home-composer";
import { AnimatedGradient } from "@/components/ui/animated-gradient";
import { WorkspaceLoopDemo } from "@/components/workspace-loop-demo";
import { currentSession } from "@/lib/auth/session";
import { runtimeReadiness } from "@/lib/env/server";

const capabilities = [
  {
    number: "01",
    name: "Design",
    detail: "Shape the brand, system, and pages together before the build runs ahead.",
    tone: "pink",
  },
  {
    number: "02",
    name: "Code",
    detail: "A real coding agent writes and debugs the project inside its own environment.",
    tone: "lilac",
  },
  {
    number: "03",
    name: "AI",
    detail: "Add chat, image, video, and content capabilities without wiring every API yourself.",
    tone: "blue",
  },
  {
    number: "04",
    name: "Deploy",
    detail: "The same agent runs the site, fixes failures, and takes the finished project live.",
    tone: "orange",
  },
] as const;

export default async function Home() {
  await connection();
  const readiness = runtimeReadiness();
  const runtimeReady = Object.values(readiness).every(Boolean);
  const session = runtimeReady ? await currentSession() : null;

  return (
    <main className="marketing-home">
      <header className="home-header">
        <Link className="brand-mark" href="/" aria-label="Project L home">
          <span className="brand-glyph" aria-hidden="true" />
          <span>Project L</span>
        </Link>

        <nav className="home-nav" aria-label="Main navigation">
          <a href="#system">System</a>
          <a href="#capabilities">Capabilities</a>
        </nav>

        <Link className="header-action" href={session ? "#start" : "/login"}>
          {session ? "New project" : "Sign in"}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <section className="hero aurora-hero" aria-labelledby="home-title">
        <AnimatedGradient
          className="aurora-field"
          config={{
            preset: "custom",
            color1: "#07020f",
            color2: "#30105c",
            color3: "#ff1f8f",
            rotation: -28,
            proportion: 63,
            scale: 0.72,
            speed: 10,
            distortion: 26,
            swirl: 58,
            swirlIterations: 8,
            softness: 96,
            offset: 180,
            shape: "Edge",
            shapeSize: 56,
          }}
          noise={{ opacity: 0.2, scale: 0.8 }}
        />
        <div className="aurora-shade" aria-hidden="true" />

        <div className="hero-kicker">
          <span>One project / one agent</span>
          <span>Design · Code · Run · Deploy</span>
        </div>

        <div className="aurora-content">
          <p className="aurora-overline">AI site maker</p>
          <h1 className="aurora-title" id="home-title">
            Make your idea
            <span>operational.</span>
          </h1>
          <p className="aurora-copy">
            Describe the site. One coding agent designs it, builds it, runs it,
            and keeps improving the real project with you.
          </p>
        </div>

        <div className="aurora-composer" id="start">
          <span className="aurora-composer-label">Start with one sentence</span>
          <HomeComposer runtimeReady={runtimeReady} signedIn={Boolean(session)} />
        </div>

        <a className="scroll-cue" href="#system">
          See how it works
          <ArrowDownRight size={16} aria-hidden="true" />
        </a>
      </section>

      <div className="spectrum-strip" aria-label="Product capabilities">
        <span>Brand</span>
        <span>Pages</span>
        <span>Code</span>
        <span>AI services</span>
        <span>Hosting</span>
      </div>

      <section className="system-section" id="system" aria-labelledby="system-title">
        <div className="section-heading">
          <span className="section-index">{"{ 01 / THE SYSTEM }"}</span>
          <h2 id="system-title">One agent.<br />The whole loop.</h2>
          <p>
            There is no handoff between a chat bot, a page generator, and a
            deployment screen. Your project has one agent with the context and
            tools to carry the work all the way through.
          </p>
        </div>

        <WorkspaceLoopDemo />
      </section>

      <section className="capability-section" id="capabilities" aria-labelledby="capability-title">
        <div className="capability-intro">
          <span className="section-index">{"{ 02 / CAPABILITIES }"}</span>
          <h2 id="capability-title">Everything between<br />the idea and the URL.</h2>
        </div>

        <div className="capability-list">
          {capabilities.map((capability) => (
            <article className={`capability-row ${capability.tone}`} key={capability.name}>
              <span className="capability-number">{capability.number}</span>
              <h3>{capability.name}</h3>
              <p>{capability.detail}</p>
              <span className="capability-shape" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="principles-section" aria-labelledby="principles-title">
        <span className="section-index">{"{ 03 / BUILT TO KEEP GOING }"}</span>
        <h2 id="principles-title">The project is<br />the memory.</h2>
        <div className="principle-copy">
          <p>
            <strong>Persistent by default.</strong>
            The conversation, code, runtime, and preview stay attached to one project.
          </p>
          <p>
            <strong>Real from the first message.</strong>
            When you ask it to build, it works in an isolated environment—not a simulated canvas.
          </p>
          <p>
            <strong>Ready for the next turn.</strong>
            Return tomorrow, continue the same session, and change what is already live.
          </p>
        </div>
      </section>

      <section className="closing-section">
        <div className="closing-mark" aria-hidden="true">L</div>
        <p className="section-index">{"{ YOUR NEXT SITE STARTS AS A SENTENCE }"}</p>
        <h2>Say what it should become.</h2>
        <a className="closing-action" href="#start">
          Start a project
          <ArrowUpRight size={20} aria-hidden="true" />
        </a>
      </section>

      <footer className="home-footer">
        <Link className="brand-mark" href="/">
          <span className="brand-glyph" aria-hidden="true" />
          <span>Project L</span>
        </Link>
        <span>One project. One agent. One live space.</span>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
