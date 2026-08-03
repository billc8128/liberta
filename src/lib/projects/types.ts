export interface ProjectStateDto {
  project: {
    id: string;
    name: string;
    status: "provisioning" | "ready" | "running" | "failed" | "archived";
    previewPort: number;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    status: "pending" | "streaming" | "completed" | "failed";
    content: string;
    createdAt: string;
  }>;
  run: null | {
    id: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    errorMessage: string | null;
    cancelRequestedAt: string | null;
    createdAt: string;
  };
  events: Array<{
    id: string;
    sequence: number;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}
