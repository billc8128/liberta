export function previewCommand(port: number) {
  return [
    "if [ -x node_modules/.bin/next ]; then",
    `exec node_modules/.bin/next dev --hostname 0.0.0.0 --port ${port};`,
    "elif [ -x node_modules/.bin/vite ]; then",
    `exec node_modules/.bin/vite --host 0.0.0.0 --port ${port};`,
    "else",
    `export HOST=0.0.0.0 PORT=${port}; exec npm run dev;`,
    "fi",
  ].join(" ");
}
