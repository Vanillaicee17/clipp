export type ClipType = "text" | "image";

export interface ClipMessage {
  id: string;
  deviceId: string;
  type: ClipType;
  payload: Uint8Array;
  timestamp: number;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: "desktop" | "mobile" | "unknown";
  publicKey: Uint8Array;
}

export type SyncEvent =
  | { type: "connection-status"; status: "connecting" | "connected" | "disconnected" }
  | { type: "pair-requested"; pin: string; device: DeviceInfo }
  | { type: "paired"; roomId: string; peer: DeviceInfo }
  | { type: "clip-received"; message: ClipMessage }
  | { type: "clip-sent"; message: ClipMessage }
  | { type: "error"; message: string };

export interface PairRequestFrame {
  kind: "pair-request";
  pin: string;
  device: DeviceInfo;
}

export interface PairAcceptFrame {
  kind: "pair-accept";
  pin: string;
  requesterPublicKey: Uint8Array;
  device: DeviceInfo;
}

export interface PairCompleteFrame {
  kind: "pair-complete";
  roomId: string;
  peer: DeviceInfo;
}

export interface SealedClipFrame {
  kind: "sealed-clip";
  senderDeviceId: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export interface ErrorFrame {
  kind: "error";
  code: string;
  message: string;
}

export interface RoomClosedFrame {
  kind: "room-closed";
  roomId: string;
  message: string;
}

export type RelayFrame =
  | PairRequestFrame
  | PairAcceptFrame
  | PairCompleteFrame
  | SealedClipFrame
  | ErrorFrame
  | RoomClosedFrame;

export interface PairingPayload {
  relayUrl: string;
  pin: string;
  publicKey: string;
}

export interface EncryptedPayload {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}
