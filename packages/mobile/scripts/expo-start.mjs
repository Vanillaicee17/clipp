import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const args = process.argv.slice(2);

const child = spawn(process.execPath, [expoCli, "start", ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_NO_DEPENDENCY_VALIDATION: "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
