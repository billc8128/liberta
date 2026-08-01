export function bullmqPrefix(prefix: string) {
  return prefix.replace(/:+$/, "");
}
