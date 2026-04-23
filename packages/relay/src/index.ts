import { RelayServer } from "./server";
import type { RelaySocket } from "./router";

interface BunServeServer {
  upgrade(request: Request): boolean;
}

interface BunWebSocketHandlers {
  open: (socket: RelaySocket) => void;
  message: (socket: RelaySocket, message: unknown) => void;
  close: (socket: RelaySocket) => void;
}

interface BunServeOptions {
  hostname?: string;
  port: number;
  fetch: (request: Request, server: BunServeServer) => Response | undefined;
  websocket: BunWebSocketHandlers;
}

interface BunRuntime {
  serve(options: BunServeOptions): { port: number };
}

const bunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun;
if (!bunRuntime) {
  throw new Error("The relay server expects to run under Bun.serve().");
}

const relay = new RelayServer();
const runtimeEnv = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const hostname = runtimeEnv?.HOST ?? "0.0.0.0";
const port = Number.parseInt(runtimeEnv?.PORT ?? "8787", 10);

// Bun keeps the default relay lightweight; the WebSocket handling here can be ported to Node's ws package if needed.
const server = bunRuntime.serve({
  hostname,
  port,
  fetch(request, runtimeServer) {
    if (runtimeServer.upgrade(request)) {
      return undefined;
    }

    return new Response("WebSocket upgrade required", { status: 426 });
  },
  websocket: {
    open(socket) {
      relay.handleOpen(socket);
    },
    message(socket, message) {
      relay.handleMessage(socket, message);
    },
    close(socket) {
      relay.handleClose(socket);
    },
  },
});

console.log(`clipp relay listening on ws://${hostname}:${server.port}`);
