import { deviceIdFromPublicKey, encodeHex } from "@clipp/core";
import type { DeviceInfo, PairAcceptFrame, PairRequestFrame } from "@clipp/core";

import type { RelaySocket } from "./router";

export interface PendingPairRequest {
  pin: string;
  device: DeviceInfo;
  socket: RelaySocket;
  requestedAt: number;
}

export interface PairingResolution {
  roomId: string;
  requester: PendingPairRequest;
  accepter: {
    socket: RelaySocket;
    device: DeviceInfo;
  };
}

const REQUEST_TTL_MS = 10 * 60 * 1000;

export class PairingManager {
  private readonly pendingByPin = new Map<string, PendingPairRequest>();

  registerRequest(frame: PairRequestFrame, socket: RelaySocket): PendingPairRequest {
    const device = normalizeDevice(frame.device);
    const pending: PendingPairRequest = {
      pin: frame.pin,
      device,
      socket,
      requestedAt: Date.now(),
    };

    this.pendingByPin.set(frame.pin, pending);
    return pending;
  }

  acceptRequest(frame: PairAcceptFrame, socket: RelaySocket): PairingResolution {
    this.cleanupExpired();

    const requester = this.pendingByPin.get(frame.pin);
    if (!requester) {
      throw new Error("No pending pairing request exists for that PIN.");
    }

    const requesterKey = encodeHex(requester.device.publicKey);
    const expectedKey = encodeHex(frame.requesterPublicKey);
    if (requesterKey !== expectedKey) {
      throw new Error("Pair accept did not match the requesting device public key.");
    }

    const accepter = normalizeDevice(frame.device);
    if (requester.device.deviceId === accepter.deviceId) {
      throw new Error("A device cannot pair with itself.");
    }

    this.pendingByPin.delete(frame.pin);

    return {
      roomId: createRoomId(requester.device, accepter),
      requester,
      accepter: {
        socket,
        device: accepter,
      },
    };
  }

  removeSocket(socket: RelaySocket): void {
    for (const [pin, pending] of this.pendingByPin.entries()) {
      if (pending.socket === socket) {
        this.pendingByPin.delete(pin);
      }
    }
  }

  cleanupExpired(now = Date.now()): void {
    for (const [pin, pending] of this.pendingByPin.entries()) {
      if (now - pending.requestedAt > REQUEST_TTL_MS) {
        this.pendingByPin.delete(pin);
      }
    }
  }
}

export function createRoomId(first: DeviceInfo, second: DeviceInfo): string {
  return [first.deviceId, second.deviceId].sort().join(":");
}

function normalizeDevice(device: DeviceInfo): DeviceInfo {
  const normalizedPublicKey = new Uint8Array(device.publicKey);
  return {
    ...device,
    publicKey: normalizedPublicKey,
    deviceId: device.deviceId || deviceIdFromPublicKey(normalizedPublicKey),
  };
}
