import { Check, ChevronDown, CircleAlert } from "lucide-react";

import {
  buildAgentProgress,
  formatRunDuration,
  terminalTail,
} from "@/components/agent-run-progress";
import { MarkdownContent } from "@/components/markdown-content";
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
  const statusLabel =
    run.status === "queued"
      ? activeStep?.label ?? "Waiting for an available agent"
      : run.cancelRequestedAt
        ? "Stopping"
        : activeStep?.label ?? "Working on your site";
  const completedCount = visibleSteps.filter((step) => step.status === "completed").length;
  const showActivity = visibleSteps.length > 1 || Boolean(liveOutput);

  return (
    <section className="agent-turn" aria-label="Agent progress">
      <span className="agent-spark" aria-hidden="true">✦</span>
      <div className="agent-turn-body">
        <p className="sr-only" aria-live="polite">
          {statusLabel}
        </p>
        <div
          className="agent-activity-line"
          data-status={run.cancelRequestedAt ? "stopping" : run.status}
        >
          <span className="agent-activity-spinner" aria-hidden="true" />
          <strong>{statusLabel}</strong>
          <time>{elapsed}</time>
        </div>

        {showActivity && (
          <details className="agent-activity-details">
            <summary>
              {completedCount > 0
                ? `${completedCount} ${completedCount === 1 ? "action" : "actions"} completed`
                : "View activity"}
              <ChevronDown size={13} aria-hidden="true" />
            </summary>
            <div className="agent-activity-detail-body">
              <ol className="agent-activity-list">
                {visibleSteps.map((step) => (
                  <li key={step.id} data-status={step.status}>
                    <span aria-hidden="true">
                      {step.status === "completed" ? (
                        <Check size={11} strokeWidth={2.4} />
                      ) : step.status === "failed" ? (
                        <CircleAlert size={11} />
                      ) : (
                        <span />
                      )}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>
              {liveOutput && <pre aria-label="Live output">{liveOutput}</pre>}
            </div>
          </details>
        )}

        {response?.trim() && (
          <MarkdownContent
            content={response}
            className="agent-streaming-response"
          />
        )}
      </div>
    </section>
  );
}
