import { realDeps } from './deps.js';
import { main } from './main.js';

// `trace-logos search x | head` closes the pipe early; that is not an error.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

main(process.argv.slice(2), realDeps()).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
