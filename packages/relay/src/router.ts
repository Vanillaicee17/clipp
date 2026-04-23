import { encodeRelayFrame } from "@clipp/core";
import type { DeviceInfo, SealedClipFrame } from "@clipp/core";

export interface RelaySocket {
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface RoomState {
  roomId: string;
  sockets: Set<RelaySocket>;
  devices: Map<string, DeviceInfo>;
}

export class MessageRouter {
  constructor(
    private readonly rooms: Map<string, RoomState>,
    private readonly socketToRoom: WeakMap<RelaySocket, string>,
  ) {}

  createRoom(
    roomId: string,
    firstSocket: RelaySocket,
    firstDevice: DeviceInfo,
    secondSocket: RelaySocket,
    secondDevice: DeviceInfo,
  ): RoomState {
    this.removeSocket(firstSocket);
    this.removeSocket(secondSocket);

    const room: RoomState = {
      roomId,
      sockets: new Set([firstSocket, secondSocket]),
      devices: new Map([
        [firstDevice.deviceId, firstDevice],
        [secondDevice.deviceId, secondDevice],
      ]),
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(firstSocket, roomId);
    this.socketToRoom.set(secondSocket, roomId);
    return room;
  }

  forward(sender: RelaySocket, frame: SealedClipFrame): boolean {
    const roomId = this.socketToRoom.get(sender);
    if (!roomId) {
      return false;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    const encoded = encodeRelayFrame(frame);
    let delivered = false;

    for (const socket of room.sockets) {
      if (socket === sender) {
        continue;
      }

      socket.send(encoded);
      delivered = true;
    }

    return delivered;
  }

  removeSocket(socket: RelaySocket): void {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) {
      return;
    }

    const room = this.rooms.get(roomId);
    this.socketToRoom.delete(socket);

    if (!room) {
      return;
    }

    room.sockets.delete(socket);

    if (room.sockets.size === 0) {
      this.rooms.delete(roomId);
      return;
    }

    const roomClosed = encodeRelayFrame({
      kind: "room-closed",
      roomId,
      message: "The paired device disconnected from the relay.",
    });

    for (const peer of room.sockets) {
      peer.send(roomClosed);
      this.socketToRoom.delete(peer);
    }

    this.rooms.delete(roomId);
  }
}
