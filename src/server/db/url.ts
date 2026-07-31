export function postgresJsUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("sslrootcert");
  return url.toString();
}
