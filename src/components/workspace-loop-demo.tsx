"use client";

import { useState, type PointerEvent } from "react";
import { ArrowUp, Check, Monitor, Smartphone } from "lucide-react";

import { AnimatedGradient } from "@/components/ui/animated-gradient";

const views = ["Brief", "Build", "Live"] as const;
type View = (typeof views)[number];

const activity: Record<View, string> = {
  Brief: "Reading the project and shaping a direction",
  Build: "Editing app/page.tsx",
  Live: "Preview updated just now",
};

export function WorkspaceLoopDemo() {
  const [view, setView] = useState<View>("Live");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--demo-ry", `${x * 1.4}deg`);
    event.currentTarget.style.setProperty("--demo-rx", `${y * -1.1}deg`);
  };

  const resetTilt = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--demo-ry", "0deg");
    event.currentTarget.style.setProperty("--demo-rx", "0deg");
  };

  return (
    <div
      className="workspace-demo-scene"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      <AnimatedGradient
        className="workspace-demo-light"
        config={{
          preset: "custom",
          color1: "#08070b",
          color2: "#38142c",
          color3: "#ff3f9b",
          rotation: -18,
          proportion: 72,
          scale: 0.46,
          speed: 5,
          distortion: 12,
          swirl: 42,
          swirlIterations: 5,
          softness: 100,
          offset: 60,
          shape: "Edge",
          shapeSize: 48,
        }}
      />

      <div className="workspace-demo">
        <div className="workspace-demo-bar">
          <div className="workspace-demo-project">
            <span className="workspace-demo-logo" aria-hidden="true" />
            <strong>Afterimage</strong>
          </div>

          <div className="workspace-demo-views" aria-label="Demo state">
            {views.map((item) => (
              <button
                className={view === item ? "is-active" : undefined}
                key={item}
                onClick={() => setView(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>

          <span className="workspace-demo-live">
            <i aria-hidden="true" /> Live
          </span>
        </div>

        <div className="workspace-demo-body">
          <div className="workspace-demo-chat">
            <div className="workspace-demo-thread">
              <div className="demo-user-message">
                A portfolio for a motion studio. Black, kinetic type, one electric color.
              </div>

              <div className="demo-agent-message">
                <span className="demo-agent-glyph" aria-hidden="true">✦</span>
                <p>
                  {view === "Brief" && "I have the direction. I’ll keep the structure quiet and let the work move."}
                  {view === "Build" && "Building the homepage now. I’m using a variable type system and a live project reel."}
                  {view === "Live" && "The first pass is live. Try the preview, then tell me what feels off."}
                </p>
              </div>
            </div>

            <div className="demo-composer" aria-hidden="true">
              <span>Tell the agent what to change…</span>
              <i><ArrowUp size={13} /></i>
            </div>
          </div>

          <div className="workspace-demo-preview">
            <div className="demo-preview-toolbar">
              <span>Preview</span>
              <div className="demo-device-switcher">
                <button
                  aria-label="Desktop preview"
                  className={device === "desktop" ? "is-active" : undefined}
                  onClick={() => setDevice("desktop")}
                  type="button"
                >
                  <Monitor size={13} />
                </button>
                <button
                  aria-label="Mobile preview"
                  className={device === "mobile" ? "is-active" : undefined}
                  onClick={() => setDevice("mobile")}
                  type="button"
                >
                  <Smartphone size={13} />
                </button>
              </div>
            </div>

            <div className={`demo-site-stage is-${device}`}>
              <div className="demo-site">
                <header>
                  <strong>AFTERIMAGE®</strong>
                  <span>WORK / 2026</span>
                </header>
                <div className="demo-site-copy">
                  <p>Independent motion practice</p>
                  <h3>MOVE<br />THE STILL.</h3>
                </div>
                <div className="demo-site-orb" aria-hidden="true" />
                <footer>
                  <span>Shanghai · London</span>
                  <span>Selected work ↗</span>
                </footer>
              </div>
            </div>
          </div>
        </div>

        <div className="workspace-demo-activity">
          <span className={view === "Live" ? "is-complete" : undefined}>
            {view === "Live" ? <Check size={11} /> : <i aria-hidden="true" />}
            {activity[view]}
          </span>
          <small>One continuous session</small>
        </div>
      </div>
    </div>
  );
}
