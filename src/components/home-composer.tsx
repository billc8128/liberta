"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface HomeComposerProps {
  runtimeReady: boolean;
  signedIn: boolean;
}

export function HomeComposer({ runtimeReady, signedIn }: HomeComposerProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = prompt.trim();
    if (!runtimeReady || !value || submitting) return;

    setError(undefined);
    if (!signedIn) {
      sessionStorage.setItem("project-l-prompt", value);
      router.push("/login");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      if (!response.ok) throw new Error("Project creation failed");
      const result = (await response.json()) as { projectId: string };
      router.push(`/projects/${result.projectId}`);
    } catch {
      setError("The workspace could not start. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="project-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="project-prompt">
          Describe the website you want to build
        </label>
        <textarea
          id="project-prompt"
          name="prompt"
          rows={3}
          placeholder="A portfolio for an independent filmmaker in Shanghai…"
          autoComplete="off"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="composer-footer">
          <span className="composer-hint">
            Start with the purpose. The agent will ask for what it needs.
          </span>
          <button
            type="submit"
            className="send-button"
            aria-label="Start building"
            disabled={!runtimeReady || submitting || !prompt.trim()}
            title={runtimeReady ? "Start building" : "Workspace is connecting"}
          >
            <ArrowUp aria-hidden="true" size={20} strokeWidth={2.2} />
          </button>
        </div>
      </form>
      {error && (
        <p className="runtime-note" role="alert">
          {error}
        </p>
      )}
      {!runtimeReady && (
        <p className="runtime-note" role="status">
          Project creation is temporarily unavailable while your workspace connects.
        </p>
      )}
    </>
  );
}
