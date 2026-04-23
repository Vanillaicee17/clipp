import type {
  ClipMessage,
  ClipType,
  DeviceInfo,
  ErrorFrame,
  PairAcceptFrame,
  PairCompleteFrame,
  PairRequestFrame,
  RelayFrame,
  ResumeSessionFrame,
  RoomClosedFrame,
  SealedClipFrame,
} from "./types";

const PROTOCOL_VERSION = 1;

const CLIP_TYPE_CODES: Record<ClipType, number> = {
  text: 1,
  image: 2,
};

const CLIP_TYPES_BY_CODE = new Map<number, ClipType>(
  Object.entries(CLIP_TYPE_CODES).map(([key, value]) => [value, key as ClipType]),
);

const FRAME_KIND_CODES = {
  "pair-request": 16,
  "pair-accept": 17,
  "pair-complete": 18,
  "sealed-clip": 19,
  error: 20,
  "room-closed": 21,
  "resume-session": 22,
} as const;

type FrameKind = keyof typeof FRAME_KIND_CODES;

const FRAME_KINDS_BY_CODE = new Map<number, FrameKind>(
  Object.entries(FRAME_KIND_CODES).map(([key, value]) => [value, key as FrameKind]),
);

class ByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  writeUint8(value: number): void {
    const buffer = new Uint8Array(1);
    buffer[0] = value;
    this.push(buffer);
  }

  writeUint32(value: number): void {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, value, false);
    this.push(buffer);
  }

  writeUint64(value: number): void {
    const buffer = new Uint8Array(8);
    new DataView(buffer.buffer).setBigUint64(0, BigInt(value), false);
    this.push(buffer);
  }

  writeString(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.writeBytes(encoded);
  }

  writeBytes(value: Uint8Array): void {
    this.writeUint32(value.byteLength);
    this.push(value);
  }

  toUint8Array(): Uint8Array {
    const output = new Uint8Array(this.length);
    let offset = 0;

    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return output;
  }

  private push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.length += chunk.byteLength;
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readUint8(): number {
    this.ensureAvailable(1);
    const value = this.bytes[this.offset];
    this.offset += 1;
    return value;
  }

  readUint32(): number {
    this.ensureAvailable(4);
    const value = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      4,
    ).getUint32(0, false);
    this.offset += 4;
    return value;
  }

  readUint64(): number {
    this.ensureAvailable(8);
    const value = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      8,
    ).getBigUint64(0, false);
    this.offset += 8;
    return Number(value);
  }

  readBytes(): Uint8Array {
    const length = this.readUint32();
    this.ensureAvailable(length);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readString(): string {
    return new TextDecoder().decode(this.readBytes());
  }

  ensureFullyRead(): void {
    if (this.offset !== this.bytes.byteLength) {
      throw new Error("Unexpected trailing bytes in protocol payload.");
    }
  }

  private ensureAvailable(length: number): void {
    if (this.offset + length > this.bytes.byteLength) {
      throw new Error("Unexpected end of protocol payload.");
    }
  }
}

export function serialize(message: ClipMessage): Uint8Array {
  const writer = new ByteWriter();
  writer.writeUint8(PROTOCOL_VERSION);
  writer.writeUint8(CLIP_TYPE_CODES[message.type]);
  writer.writeString(message.id);
  writer.writeString(message.deviceId);
  writer.writeUint64(message.timestamp);
  writer.writeBytes(message.payload);
  return writer.toUint8Array();
}

export function deserialize(buffer: Uint8Array): ClipMessage {
  const reader = new ByteReader(buffer);
  const version = reader.readUint8();
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported clip protocol version: ${version}`);
  }

  const typeCode = reader.readUint8();
  const type = CLIP_TYPES_BY_CODE.get(typeCode);
  if (!type) {
    throw new Error(`Unsupported clip type: ${typeCode}`);
  }

  const message: ClipMessage = {
    id: reader.readString(),
    deviceId: reader.readString(),
    type,
    timestamp: reader.readUint64(),
    payload: reader.readBytes(),
  };

  reader.ensureFullyRead();
  return message;
}

export function encodeRelayFrame(frame: RelayFrame): Uint8Array {
  const writer = new ByteWriter();
  writer.writeUint8(PROTOCOL_VERSION);
  writer.writeUint8(FRAME_KIND_CODES[frame.kind]);

  switch (frame.kind) {
    case "pair-request":
      writer.writeString(frame.pin);
      writeDevice(writer, frame.device);
      break;
    case "pair-accept":
      writer.writeString(frame.pin);
      writeDevice(writer, frame.device);
      break;
    case "pair-complete":
      writer.writeString(frame.roomId);
      writeDevice(writer, frame.peer);
      break;
    case "resume-session":
      writeDevice(writer, frame.device);
      break;
    case "sealed-clip":
      writer.writeString(frame.senderDeviceId);
      writer.writeBytes(frame.nonce);
      writer.writeBytes(frame.ciphertext);
      break;
    case "error":
      writer.writeString(frame.code);
      writer.writeString(frame.message);
      break;
    case "room-closed":
      writer.writeString(frame.roomId);
      writer.writeString(frame.message);
      break;
    default: {
      const exhaustiveFrame: never = frame;
      throw new Error(`Unsupported relay frame: ${String(exhaustiveFrame)}`);
    }
  }

  return writer.toUint8Array();
}

export function decodeRelayFrame(buffer: Uint8Array): RelayFrame {
  const reader = new ByteReader(buffer);
  const version = reader.readUint8();
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported relay frame version: ${version}`);
  }

  const kindCode = reader.readUint8();
  const kind = FRAME_KINDS_BY_CODE.get(kindCode);
  if (!kind) {
    throw new Error(`Unsupported relay frame kind: ${kindCode}`);
  }

  let frame: RelayFrame;

  switch (kind) {
    case "pair-request":
      frame = {
        kind,
        pin: reader.readString(),
        device: readDevice(reader),
      } satisfies PairRequestFrame;
      break;
    case "pair-accept":
      frame = {
        kind,
        pin: reader.readString(),
        device: readDevice(reader),
      } satisfies PairAcceptFrame;
      break;
    case "pair-complete":
      frame = {
        kind,
        roomId: reader.readString(),
        peer: readDevice(reader),
      } satisfies PairCompleteFrame;
      break;
    case "resume-session":
      frame = {
        kind,
        device: readDevice(reader),
      } satisfies ResumeSessionFrame;
      break;
    case "sealed-clip":
      frame = {
        kind,
        senderDeviceId: reader.readString(),
        nonce: reader.readBytes(),
        ciphertext: reader.readBytes(),
      } satisfies SealedClipFrame;
      break;
    case "error":
      frame = {
        kind,
        code: reader.readString(),
        message: reader.readString(),
      } satisfies ErrorFrame;
      break;
    case "room-closed":
      frame = {
        kind,
        roomId: reader.readString(),
        message: reader.readString(),
      } satisfies RoomClosedFrame;
      break;
    default:
      throw new Error(`Unsupported relay frame kind: ${kind}`);
  }

  reader.ensureFullyRead();
  return frame;
}

function writeDevice(writer: ByteWriter, device: DeviceInfo): void {
  writer.writeString(device.deviceId);
  writer.writeString(device.name);
  writer.writeString(device.platform);
  writer.writeBytes(device.publicKey);
}

function readDevice(reader: ByteReader): DeviceInfo {
  const deviceId = reader.readString();
  const name = reader.readString();
  const platform = reader.readString();
  if (platform !== "desktop" && platform !== "mobile" && platform !== "unknown") {
    throw new Error(`Unsupported device platform: ${platform}`);
  }

  return {
    deviceId,
    name,
    platform,
    publicKey: reader.readBytes(),
  };
}
