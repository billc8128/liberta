import type { KeyboardEvent } from "react";

export function isSubmitKey(input: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}) {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
}

export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (!isSubmitKey({
    key: event.key,
    shiftKey: event.shiftKey,
    isComposing: event.nativeEvent.isComposing,
  })) {
    return;
  }

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
