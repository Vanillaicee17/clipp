import { encodeRelayFrame } from "@clipp/core";
import type { DeviceInfo, PairCompleteFrame, SealedClipFrame } from "@clipp/core";

export interface RelaySocket {
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

interface RoomParticipant {
  device: DeviceInfo;
  socket: RelaySocket | null;
}

export interface RoomState {
  roomId: string;
  participants: Map<string, RoomParticipant>;
}

export class MessageRouter {
  constructor(
    private readonly rooms: Map<string, RoomState>,
    private readonly socketToRoom: WeakMap<RelaySocket, string>,
    private readonly socketToDevice: WeakMap<RelaySocket, string>,
    private readonly deviceToRoom: Map<string, string>,
  ) {}

  createRoom(
    roomId: string,
    firstSocket: RelaySocket,
    firstDevice: DeviceInfo,
    secondSocket: RelaySocket,
    secondDevice: DeviceInfo,
  ): RoomState {
    this.unlinkDevice(firstDevice.deviceId, "This device was paired with another session.");
    this.unlinkDevice(secondDevice.deviceId, "This device was paired with another session.");
    this.removeSocket(firstSocket);
    this.removeSocket(secondSocket);

    const room: RoomState = {
      roomId,
      participants: new Map([
        [
          firstDevice.deviceId,
          {
            device: firstDevice,
            socket: firstSocket,
          },
        ],
        [
          secondDevice.deviceId,
          {
            device: secondDevice,
            socket: secondSocket,
          },
        ],
      ]),
    };    

    this.rooms.set(roomId, room);
    this.deviceToRoom.set(firstDevice.deviceId, roomId);
    this.deviceToRoom.set(secondDevice.deviceId, roomId);
    this.socketToRoom.set(firstSocket, roomId);
    this.socketToDevice.set(firstSocket, firstDevice.deviceId);
    this.socketToRoom.set(secondSocket, roomId);
    this.socketToDevice.set(secondSocket, secondDevice.deviceId);
    return room;
  }

  resume(device: DeviceInfo, socket: RelaySocket): PairCompleteFrame | null {
    this.removeSocket(socket);

    const roomId = this.deviceToRoom.get(device.deviceId);
    if (!roomId) {
      return null;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.deviceToRoom.delete(device.deviceId);
      return null;
    }

    const participant = room.participants.get(device.deviceId);
    if (!participant) {
      this.deviceToRoom.delete(device.deviceId);
      return null;
    }

    participant.device = device;
    participant.socket = socket;
    this.socketToRoom.set(socket, roomId);
    this.socketToDevice.set(socket, device.deviceId);

    const peer = getPeer(room, device.deviceId);
    if (!peer) {
      return null;
    }

    return {
      kind: "pair-complete",
      roomId,
      peer: peer.device,
    };
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

    const senderDeviceId = this.socketToDevice.get(sender);
    if (!senderDeviceId) {
      return false;
    }

    const encoded = encodeRelayFrame(frame);
    let delivered = false;

    for (const [deviceId, participant] of room.participants) {
      if (deviceId === senderDeviceId || !participant.socket) {
        continue;
      }

      participant.socket.send(encoded);
      delivered = true;
    }

    return delivered;
  }

  removeSocket(socket: RelaySocket): void {
    const roomId = this.socketToRoom.get(socket);
    const deviceId = this.socketToDevice.get(socket);
    if (!roomId) {
      return;
    }

    const room = this.rooms.get(roomId);
    this.socketToRoom.delete(socket);
    this.socketToDevice.delete(socket);

    if (!room) {
      return;
    }

    if (deviceId) {
      const participant = room.participants.get(deviceId);
      if (participant && participant.socket === socket) {
        participant.socket = null;
      }
    }
  }

  private unlinkDevice(deviceId: string, message: string): void {
    const roomId = this.deviceToRoom.get(deviceId);
    if (!roomId) {
      return;
    }

    this.unlinkRoom(roomId, message);
  }

  private unlinkRoom(roomId: string, message: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const roomClosed = encodeRelayFrame({
      kind: "room-closed",
      roomId,
      message,
    });

    for (const [deviceId, participant] of room.participants) {
      this.deviceToRoom.delete(deviceId);

      if (participant.socket) {
        this.socketToRoom.delete(participant.socket);
        this.socketToDevice.delete(participant.socket);
        participant.socket.send(roomClosed);
      }
    }

    this.rooms.delete(roomId);
  }
}

function getPeer(room: RoomState, deviceId: string): RoomParticipant | null {
  for (const [peerDeviceId, participant] of room.participants) {
    if (peerDeviceId !== deviceId) {
      return participant;
    }
  }

  return null;
}
