"use client";

import {
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Monitor,
  RefreshCw,
  Square,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AgentRunProgressCard } from "@/components/agent-run-progress-card";
import { MarkdownContent } from "@/components/markdown-content";
import { submitOnEnter } from "@/components/submit-on-enter";
import { MarketingThemeSwitch } from "@/components/marketing-theme";
import { creatorFacingResponse } from "@/lib/projects/creator-response";
import type { ProjectStateDto } from "@/lib/projects/types";

interface ProjectWorkspaceProps {
  initialState: ProjectStateDto;
}

export function ProjectWorkspace({ initialState }: ProjectWorkspaceProps) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [previewToken, setPreviewToken] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [previewVersion, setPreviewVersion] = useState(0);
  const [sending, setSending] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [messageError, setMessageError] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [runOutputs, setRunOutputs] = useState<
    Record<string, { runId: string; output: string }>
  >({});
  const chatEnd = useRef<HTMLDivElement>(null);
  const conversationScroll = useRef<HTMLDivElement>(null);
  const stayAtBottom = useRef(true);
  const previewRefreshing = useRef(false);
  const runActive = state.run?.status === "queued" || state.run?.status === "running";

  const refreshPreview = useCallback(async () => {
    if (previewRefreshing.current) return false;
    previewRefreshing.current = true;
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const response = await fetch(`/api/projects/${state.project.id}/preview`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (state.project.status === "ready") {
          setPreviewError("The preview could not load. Try again in a moment.");
        }
        return false;
      }
      const result = (await response.json()) as { token: string };
      setPreviewToken(result.token);
      setPreviewVersion((version) => version + 1);
      return true;
    } catch {
      setPreviewError("The preview could not load. Try again in a moment.");
      return false;
    } finally {
      setPreviewLoading(false);
      previewRefreshing.current = false;
    }
  }, [state.project.id, state.project.status]);

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
    const updateRunOutput = (event: MessageEvent<string>) => {
      const update = JSON.parse(event.data) as {
        runId: string;
        toolCallId: string;
        output: string;
      };
      setRunOutputs((current) => ({
        ...current,
        [update.toolCallId]: { runId: update.runId, output: update.output },
      }));
    };
    events.addEventListener("state", updateState as EventListener);
    events.addEventListener("message_delta", appendMessage as EventListener);
    events.addEventListener("message_replace", replaceMessage as EventListener);
    events.addEventListener("run_output", updateRunOutput as EventListener);
    return () => events.close();
  }, [state.project.id]);

  useEffect(() => {
    if (state.run?.status !== "queued") return;
    const refreshQueue = async () => {
      const response = await fetch(`/api/projects/${state.project.id}`, {
        cache: "no-store",
      });
      if (response.ok) setState((await response.json()) as ProjectStateDto);
    };
    const timer = window.setInterval(() => void refreshQueue(), 4_000);
    return () => window.clearInterval(timer);
  }, [state.project.id, state.run?.status]);

  useEffect(() => {
    if (state.project.status !== "ready" && state.project.status !== "running") {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await refreshPreview();
      if (!cancelled && state.project.status === "running") {
        timer = window.setTimeout(() => void poll(), 4_000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshPreview, state.project.status, state.project.updatedAt]);

  useEffect(() => {
    if (!runActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [runActive]);

  useEffect(() => {
    if (stayAtBottom.current) chatEnd.current?.scrollIntoView({ behavior: "auto" });
  }, [state.messages, state.events.length]);

  const handleConversationScroll = () => {
    const element = conversationScroll.current;
    if (!element) return;
    stayAtBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  };

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const prompt = String(data.get("prompt") ?? "").trim();
    if (!prompt || sending) return;

    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimisticMessage: ProjectStateDto["messages"][number] = {
      id: optimisticId,
      role: "user",
      status: "completed",
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    setSending(true);
    setMessageError(undefined);
    setChatPrompt("");
    setState((current) => ({
      ...current,
      messages: [...current.messages, optimisticMessage],
    }));

    try {
      const response = await fetch(`/api/projects/${state.project.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) {
        setState((current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticId),
        }));
        setChatPrompt((current) => current || prompt);
        setMessageError("This message could not be sent.");
        return;
      }

      const result = (await response.json()) as {
        message: ProjectStateDto["messages"][number];
        run: NonNullable<ProjectStateDto["run"]>;
      };
      setState((current) => {
        const messages = current.messages.filter(
          (message) => message.id !== optimisticId,
        );
        return {
          ...current,
          messages: messages.some((message) => message.id === result.message.id)
            ? messages
            : [...messages, result.message],
          run:
            current.run?.status === "queued" || current.run?.status === "running"
              ? current.run
              : result.run,
        };
      });
    } catch {
      setState((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== optimisticId),
      }));
      setChatPrompt((current) => current || prompt);
      setMessageError("This message could not be sent.");
    } finally {
      setSending(false);
    }

  }

  async function stopRun() {
    if (!state.run || stopping) return;
    setStopping(true);
    try {
      await fetch(
        `/api/projects/${state.project.id}/runs/${state.run.id}`,
        { method: "DELETE" },
      );
    } finally {
      setStopping(false);
    }
  }

  const agentActive = sending || runActive;
  const streamingMessage = [...state.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.status === "streaming");
  const failedMessage = [...state.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.status === "failed");
  const liveOutput = Object.values(runOutputs)
    .filter((output) => output.runId === state.run?.id)
    .at(-1)?.output;
  const previewReady = Boolean(previewToken);
  const previewDocumentUrl = previewToken
    ? `/api/projects/${state.project.id}/preview/proxy/${encodeURIComponent(previewToken)}/?version=${previewVersion}`
    : undefined;

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

        <div
          className="conversation-scroll"
          ref={conversationScroll}
          onScroll={handleConversationScroll}
        >
          {state.messages.map((message) =>
            message.id === streamingMessage?.id ||
            (state.run?.status === "failed" && message.id === failedMessage?.id) ? null : (
              <article key={message.id} className={`message ${message.role}`}>
                {message.role === "assistant" && <span className="agent-spark" aria-hidden="true">✦</span>}
                <MarkdownContent
                  content={
                    message.role === "assistant"
                      ? creatorFacingResponse(message.content, false)
                      : message.content
                  }
                  className="message-markdown"
                />
              </article>
            ),
          )}
          {runActive && (
            <AgentRunProgressCard
              state={state}
              now={now}
              output={liveOutput}
              response={streamingMessage?.content}
            />
          )}
          {sending && !runActive && (
            <div className="agent-sending"><span aria-hidden="true" /> Sending…</div>
          )}
          {state.run?.status === "failed" && (
            <p className="run-error" role="alert">
              <strong>The agent stopped before it could finish.</strong>
              {state.run.errorMessage?.slice(0, 280) ?? "Send another message to retry."}
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
            value={chatPrompt}
            onChange={(event) => setChatPrompt(event.target.value)}
            onKeyDown={submitOnEnter}
          />
          <div className="composer-footer">
            <span>
              {runActive
                ? state.queue?.followUps
                  ? `${state.queue.followUps} follow-up${state.queue.followUps === 1 ? "" : "s"} queued`
                  : "Send another message — it will run next"
                : "Enter to send · Shift + Enter for a new line"}
            </span>
            <div className="composer-actions">
              {runActive && (
                <button
                  className="composer-cancel"
                  type="button"
                  onClick={() => void stopRun()}
                  disabled={stopping || state.run?.cancelRequestedAt !== null}
                >
                  <Square size={10} fill="currentColor" />
                  {stopping || state.run?.cancelRequestedAt ? "Stopping…" : "Cancel"}
                </button>
              )}
              <button
                className="composer-send"
                type="submit"
                aria-label="Send message"
                disabled={sending || !chatPrompt.trim()}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
          {messageError && <p role="alert">{messageError}</p>}
        </form>
      </aside>

      <section className="preview-panel">
        <header className="preview-toolbar">
          <div className="preview-label"><span /> Live preview</div>
          <div className="device-switcher" role="group" aria-label="Preview size">
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
              disabled={state.project.status !== "ready" && state.project.status !== "running"}
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={() =>
                previewReady &&
                window.open(
                  `/projects/${state.project.id}/preview`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              aria-label="Open preview in a new tab"
              disabled={!previewReady}
            ><ExternalLink size={16} /></button>
          </div>
        </header>

        <div className={`preview-stage ${view}`}>
          <div className="preview-canvas">
            {previewReady ? (
              <>
                <iframe
                  key={previewVersion}
                  src={previewDocumentUrl}
                  title={`${state.project.name} preview`}
                  allow="clipboard-read; clipboard-write; fullscreen"
                  sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                  allowFullScreen
                  onLoad={() => setPreviewLoading(false)}
                />
                {previewLoading && (
                  <div className="preview-feedback" aria-live="polite">
                    <span aria-hidden="true" />
                    <strong>Preparing your preview</strong>
                    <p>Your site will appear here automatically.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="preview-empty">
                <div className="aperture" aria-hidden="true" />
                <p>{previewError ?? previewStatus(state)}</p>
                {previewError && (
                  <button type="button" onClick={() => void refreshPreview()}>
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function previewStatus(state: ProjectStateDto) {
  if (state.project.status === "failed") return "The preview is unavailable until the agent recovers.";
  if (state.run?.status === "queued") return "Waiting for an available agent.";
  if (state.run?.status === "running") return "Building the first runnable preview…";
  return "Start a conversation to build the site.";
}
