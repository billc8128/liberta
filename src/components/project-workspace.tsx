"use client";

import {
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Monitor,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { submitOnEnter } from "@/components/submit-on-enter";
import { MarketingThemeSwitch } from "@/components/marketing-theme";
import type { ProjectStateDto } from "@/lib/projects/types";

interface ProjectWorkspaceProps {
  initialState: ProjectStateDto;
}

export function ProjectWorkspace({ initialState }: ProjectWorkspaceProps) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewVersion, setPreviewVersion] = useState(0);
  const [sending, setSending] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [messageError, setMessageError] = useState<string>();
  const chatEnd = useRef<HTMLDivElement>(null);

  const refreshPreview = useCallback(async () => {
    const response = await fetch(`/api/projects/${state.project.id}/preview`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const result = (await response.json()) as { url: string };
    setPreviewUrl(result.url);
    setPreviewVersion((version) => version + 1);
  }, [state.project.id]);

  useEffect(() => {
    const events = new EventSource(`/api/projects/${state.project.id}/events`);
    const updateState = (event: MessageEvent<string>) => {
      setState(JSON.parse(event.data) as ProjectStateDto);
    };
    const appendMessage = (event: MessageEvent<string>) => {
      const update = JSON.parse(event.data) as {
        messageId: string;
        delta: string;
      };
      setState((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === update.messageId
            ? { ...message, content: message.content + update.delta }
            : message,
        ),
      }));
    };
    const replaceMessage = (event: MessageEvent<string>) => {
      const update = JSON.parse(event.data) as {
        messageId: string;
        content: string;
      };
      setState((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === update.messageId
            ? { ...message, content: update.content }
            : message,
        ),
      }));
    };
    events.addEventListener("state", updateState as EventListener);
    events.addEventListener("message_delta", appendMessage as EventListener);
    events.addEventListener("message_replace", replaceMessage as EventListener);
    return () => events.close();
  }, [state.project.id]);

  useEffect(() => {
    if (state.project.status !== "ready" || previewUrl) return;
    const timer = window.setTimeout(() => void refreshPreview(), 0);
    return () => window.clearTimeout(timer);
  }, [previewUrl, refreshPreview, state.project.status]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.events.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const prompt = String(data.get("prompt") ?? "").trim();
    if (!prompt || sending) return;

    setSending(true);
    setMessageError(undefined);
    const response = await fetch(`/api/projects/${state.project.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setMessageError(
        result.error === "PROJECT_BUSY"
          ? "The agent is still working on the previous message."
          : "This message could not be sent.",
      );
      setSending(false);
      return;
    }

    setChatPrompt("");
    setPreviewUrl(undefined);
    setSending(false);
  }

  const activity = currentActivity(state);
  const agentActive = state.run?.status === "queued" || state.run?.status === "running";

  return (
    <main className="workspace-shell">
      <aside className="conversation-panel">
        <header className="workspace-project-header">
          <Link href="/" aria-label="Back to projects"><ArrowLeft size={18} /></Link>
          <div className="workspace-project-meta">
            <strong>{state.project.name}</strong>
            <span>{agentActive ? "Agent working" : "Project agent"}</span>
          </div>
          <MarketingThemeSwitch />
        </header>

        <div className="conversation-scroll" aria-live="polite">
          {state.messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              {message.role === "assistant" && <span className="agent-spark" aria-hidden="true">✦</span>}
              <p>{message.content}</p>
            </article>
          ))}
          {agentActive && (
            <div className="agent-activity">
              <span aria-hidden="true" />
              {activity}
            </div>
          )}
          {state.run?.status === "failed" && (
            <p className="run-error" role="alert">
              The agent stopped before it could finish. You can send another message to retry.
            </p>
          )}
          <div ref={chatEnd} />
        </div>

        <form className="chat-composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="chat-prompt">Message the project agent</label>
          <textarea
            id="chat-prompt"
            name="prompt"
            rows={2}
            placeholder="Tell the agent what to change…"
            disabled={agentActive || sending}
            value={chatPrompt}
            onChange={(event) => setChatPrompt(event.target.value)}
            onKeyDown={submitOnEnter}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={agentActive || sending || !chatPrompt.trim()}
          >
            <ArrowUp size={18} />
          </button>
          {messageError && <p role="alert">{messageError}</p>}
        </form>
      </aside>

      <section className="preview-panel">
        <header className="preview-toolbar">
          <div className="preview-label"><span /> Live preview</div>
          <div className="device-switcher" aria-label="Preview size">
            <button
              className={view === "desktop" ? "active" : undefined}
              onClick={() => setView("desktop")}
              aria-label="Desktop preview"
            ><Monitor size={16} /></button>
            <button
              className={view === "mobile" ? "active" : undefined}
              onClick={() => setView("mobile")}
              aria-label="Mobile preview"
            ><Smartphone size={16} /></button>
          </div>
          <div className="preview-actions">
            <button
              onClick={() => void refreshPreview()}
              aria-label="Refresh preview"
              disabled={state.project.status !== "ready"}
            >
              <RefreshCw size={16} />
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open preview in a new tab"
              aria-disabled={!previewUrl}
            ><ExternalLink size={16} /></a>
          </div>
        </header>

        <div className={`preview-stage ${view}`}>
          {previewUrl ? (
            <iframe
              key={previewVersion}
              src={previewUrl}
              title={`${state.project.name} preview`}
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className="preview-empty">
              <div className="aperture" aria-hidden="true" />
              <p>{previewStatus(state)}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function currentActivity(state: ProjectStateDto) {
  if (state.run?.status === "queued") return "Preparing the project space…";
  const event = state.events.at(-1);
  const tool = typeof event?.payload.toolName === "string" ? event.payload.toolName : undefined;
  if (tool === "read") return "Reading the project…";
  if (tool === "write" || tool === "edit") return "Editing the site…";
  if (tool === "bash") return "Running the project…";
  return "Working through your request…";
}

function previewStatus(state: ProjectStateDto) {
  if (state.project.status === "failed") return "The preview is unavailable until the agent recovers.";
  if (state.run?.status === "queued") return "The workspace is being prepared.";
  if (state.run?.status === "running") return "Your site will appear here as soon as it runs.";
  return "Start a conversation to build the site.";
}
