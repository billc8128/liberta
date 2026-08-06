import { Check, ChevronDown, CircleAlert } from "lucide-react";

import {
  buildAgentProgress,
  formatRunDuration,
  terminalTail,
} from "@/components/agent-run-progress";
import type { ProjectStateDto } from "@/lib/projects/types";

interface AgentRunProgressCardProps {
  state: ProjectStateDto;
  now: number;
  output?: string;
  response?: string;
}

export function AgentRunProgressCard({
  state,
  now,
  output,
  response,
}: AgentRunProgressCardProps) {
  const run = state.run;
  if (!run) return null;
  const steps = buildAgentProgress(state);
  const visibleSteps = steps.slice(-6);
  const startedAt = run.startedAt ?? run.createdAt;
  const elapsed = formatRunDuration(startedAt, now, run.completedAt ?? undefined);
  const liveOutput = output ? terminalTail(output) : "";
  const activeStep = [...steps].reverse().find((step) => step.status === "active");
  const heading =
    run.status === "queued"
      ? "Your request is queued"
      : run.cancelRequestedAt
        ? "Stopping the agent"
        : "Building your project";

  return (
    <section className="agent-turn" aria-label="Agent progress">
      <span className="agent-spark" aria-hidden="true">✦</span>
      <div className="agent-turn-body">
        <p className="sr-only" aria-live="polite">
          {activeStep?.label ?? heading}
        </p>
        <header className="agent-turn-heading">
          <strong>{heading}</strong>
          <time>{elapsed}</time>
        </header>

        <ol className="agent-progress-rail">
          {visibleSteps.map((step) => (
            <li key={step.id} data-status={step.status}>
              <span className="agent-progress-marker" aria-hidden="true">
                {step.status === "completed" ? (
                  <Check size={10} strokeWidth={2.5} />
                ) : step.status === "failed" ? (
                  <CircleAlert size={11} />
                ) : (
                  <span />
                )}
              </span>
              <div>
                <span>{step.label}</span>
                {step.detail && <small>{step.detail}</small>}
              </div>
              <time>
                {formatRunDuration(step.startedAt, now, step.completedAt)}
              </time>
            </li>
          ))}
        </ol>

        {liveOutput && (
          <details className="agent-live-output" open>
            <summary>
              Live output
              <ChevronDown size={13} aria-hidden="true" />
            </summary>
            <pre>{liveOutput}</pre>
          </details>
        )}

        {response?.trim() && <p className="agent-streaming-response">{response}</p>}
      </div>
    </section>
  );
}
