import { decodeRelayFrame, encodeRelayFrame } from "@clipp/core";
import type { ErrorFrame, PairCompleteFrame } from "@clipp/core";

import { PairingManager } from "./pairing";
import { MessageRouter, type RelaySocket, type RoomState } from "./router";

export class RelayServer {
  private readonly rooms = new Map<string, RoomState>();
  private readonly socketToRoom = new WeakMap<RelaySocket, string>();
  private readonly pairing = new PairingManager();
  private readonly router = new MessageRouter(this.rooms, this.socketToRoom);

  handleOpen(_socket: RelaySocket): void {}

  handleMessage(socket: RelaySocket, rawMessage: unknown): void {
    const payload = normalizeBinaryMessage(rawMessage);
    if (!payload) {
      this.sendError(socket, "invalid-payload", "Relay only accepts binary WebSocket frames.");
      return;
    }

    let frame;
    try {
      frame = decodeRelayFrame(payload);
    } catch (error) {
      this.sendError(socket, "decode-failed", toMessage(error));
      return;
    }

    try {
      switch (frame.kind) {
        case "pair-request":
          this.pairing.registerRequest(frame, socket);
          break;
        case "pair-accept": {
          const resolution = this.pairing.acceptRequest(frame, socket);
          this.router.createRoom(
            resolution.roomId,
            resolution.requester.socket,
            resolution.requester.device,
            resolution.accepter.socket,
            resolution.accepter.device,
          );

          const requesterComplete: PairCompleteFrame = {
            kind: "pair-complete",
            roomId: resolution.roomId,
            peer: resolution.accepter.device,
          };
          const accepterComplete: PairCompleteFrame = {
            kind: "pair-complete",
            roomId: resolution.roomId,
            peer: resolution.requester.device,
          };

          resolution.requester.socket.send(encodeRelayFrame(requesterComplete));
          resolution.accepter.socket.send(encodeRelayFrame(accepterComplete));
          break;
        }
        case "sealed-clip":
          if (!this.router.forward(socket, frame)) {
            this.sendError(socket, "not-paired", "No paired device is available for this session.");
          }
          break;
        case "pair-complete":
        case "error":
        case "room-closed":
          this.sendError(socket, "invalid-frame", `Clients cannot send ${frame.kind} frames.`);
          break;
        default: {
          const exhaustiveFrame: never = frame;
          throw new Error(`Unhandled relay frame: ${String(exhaustiveFrame)}`);
        }
      }
    } catch (error) {
      this.sendError(socket, "relay-error", toMessage(error));
    }
  }

  handleClose(socket: RelaySocket): void {
    this.pairing.removeSocket(socket);
    this.router.removeSocket(socket);
  }

  private sendError(socket: RelaySocket, code: string, message: string): void {
    const frame: ErrorFrame = {
      kind: "error",
      code,
      message,
    };

    socket.send(encodeRelayFrame(frame));
  }
}

function normalizeBinaryMessage(rawMessage: unknown): Uint8Array | null {
  if (rawMessage instanceof Uint8Array) {
    return rawMessage;
  }

  if (rawMessage instanceof ArrayBuffer) {
    return new Uint8Array(rawMessage);
  }

  if (ArrayBuffer.isView(rawMessage)) {
    return new Uint8Array(rawMessage.buffer, rawMessage.byteOffset, rawMessage.byteLength);
  }

  return null;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown relay error";
}
