import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={["markdown-content", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: MarkdownLink,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownLink({ href, ...props }: ComponentPropsWithoutRef<"a">) {
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    />
  );
}
