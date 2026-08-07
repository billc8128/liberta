export function previewCommand(port: number) {
  return [
    "if [ -x node_modules/.bin/next ]; then",
    `exec node_modules/.bin/next dev --hostname 0.0.0.0 --port ${port};`,
    "elif [ -x node_modules/.bin/vite ]; then",
    `exec node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { host: '0.0.0.0', port: ${port}, strictPort: true, hmr: false } }); await server.listen();";`,
    "elif [ -f package.json ]; then",
    `export HOST=0.0.0.0 PORT=${port}; exec npm run dev;`,
    "elif [ -f index.html ]; then",
    `exec python3 -m http.server ${port} --bind 0.0.0.0;`,
    "else",
    "exit 1;",
    "fi",
  ].join(" ");
}

export function runnableWebsiteCheckCommand() {
  return "test -f package.json || test -f index.html";
}
