import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  createPin,
  decodeBase64,
  decodeRelayFrame,
  decodeText,
  decrypt,
  deviceIdFromPublicKey,
  encodeBase64,
  encodeRelayFrame,
  encodeText,
  encrypt,
  generateKeyPair,
  serialize,
  deserialize,
} from "@clipp/core";
import type { ClipMessage, DeviceInfo, KeyPair } from "@clipp/core";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "paired";

const KEYPAIR_STORAGE_KEY = "clipp.desktop.keypair";
const PAIRED_DEVICE_STORAGE_KEY = "clipp.desktop.paired-device";
const RECONNECT_DELAY_MS = 1000;

interface StoredKeyPair {
  publicKey: string;
  secretKey: string;
}

interface StoredDeviceInfo {
  deviceId: string;
  name: string;
  platform: DeviceInfo["platform"];
  publicKey: string;
}

interface UseSyncOptions {
  clipboardText: string;
  relayUrl: string;
  setClipboardText: (text: string) => Promise<void>;
  deviceName?: string;
}

interface UseSyncResult {
  connectionStatus: ConnectionStatus;
  deviceId: string;
  publicKeyBase64: string;
  pairedDevice: DeviceInfo | null;
  history: string[];
  lastSyncedText: string;
  pairPin: string;
  setPairPin: (pin: string) => void;
  startPairing: () => void;
  acceptPairing: () => void;
}

export function useSync({
  clipboardText,
  relayUrl,
  setClipboardText,
  deviceName = "Desktop",
}: UseSyncOptions): UseSyncResult {
  const [keyPair] = useState<KeyPair>(() => loadOrCreateKeyPair());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [pairedDevice, setPairedDevice] = useState<DeviceInfo | null>(() => loadStoredPairedDevice());
  const [history, setHistory] = useState<string[]>([]);
  const [lastSyncedText, setLastSyncedText] = useState("");
  const [pairPin, setPairPin] = useState(createPin());
  const [reconnectToken, setReconnectToken] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemoteChangeRef = useRef(false);
  const lastSentTextRef = useRef("");
  const seenMessageIdsRef = useRef(new Set<string>());
  const pairedDeviceRef = useRef<DeviceInfo | null>(null);
  const setClipboardTextRef = useRef(setClipboardText);

  const deviceId = useMemo(() => deviceIdFromPublicKey(keyPair.publicKey), [keyPair.publicKey]);
  const publicKeyBase64 = useMemo(() => encodeBase64(keyPair.publicKey), [keyPair.publicKey]);

  useEffect(() => {
    pairedDeviceRef.current = pairedDevice;
  }, [pairedDevice]);

  useEffect(() => {
    setClipboardTextRef.current = setClipboardText;
  }, [setClipboardText]);

  useEffect(() => {
    if (!relayUrl) {
      setConnectionStatus("disconnected");
      clearReconnectTimer(reconnectTimerRef);
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }

    let disposed = false;
    const socket = new WebSocket(relayUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    clearReconnectTimer(reconnectTimerRef);
    setConnectionStatus("connecting");

    socket.onopen = () => {
      clearReconnectTimer(reconnectTimerRef);
      setConnectionStatus("connected");

      const storedPeer = pairedDeviceRef.current;
      if (!storedPeer) {
        return;
      }

      socket.send(
        toSocketBinary(
          encodeRelayFrame({
            kind: "resume-session",
            device: {
              deviceId,
              name: deviceName,
              platform: "desktop",
              publicKey: keyPair.publicKey,
            },
          }),
        ),
      );
    };

    socket.onmessage = async (event) => {
      const payload = await readBinaryMessage(event.data);
      if (!payload) {
        return;
      }

      const frame = decodeRelayFrame(payload);

      switch (frame.kind) {
        case "pair-complete":
          storePairedDevice(frame.peer);
          setPairedDevice(frame.peer);
          setConnectionStatus("paired");
          break;
        case "sealed-clip": {
          const peer = pairedDeviceRef.current;
          if (!peer) {
            return;
          }

          const plaintext = decrypt(
            frame.ciphertext,
            frame.nonce,
            peer.publicKey,
            keyPair.secretKey,
          );

          if (!plaintext) {
            return;
          }

          const message = deserialize(plaintext);
          if (seenMessageIdsRef.current.has(message.id)) {
            return;
          }

          seenMessageIdsRef.current.add(message.id);
          const text = decodeText(message.payload);
          applyingRemoteChangeRef.current = true;
          await setClipboardTextRef.current(text);
          setLastSyncedText(text);
          setHistory((current) => makeHistory(current, text));
          break;
        }
        case "room-closed":
          clearStoredPairedDevice();
          setPairedDevice(null);
          setConnectionStatus("connected");
          break;
        case "error":
          if (frame.code === "resume-failed") {
            clearStoredPairedDevice();
            setPairedDevice(null);
            setConnectionStatus("connected");
          }
          console.warn(`[clipp] ${frame.code}: ${frame.message}`);
          break;
        case "pair-request":
        case "pair-accept":
        case "resume-session":
          break;
      }
    };

    socket.onclose = () => {
      setConnectionStatus("disconnected");
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      if (!disposed) {
        scheduleReconnect(reconnectTimerRef, setReconnectToken);
      }
    };

    socket.onerror = (event) => {
      console.warn("[clipp] desktop socket error", event);
    };

    return () => {
      disposed = true;
      clearReconnectTimer(reconnectTimerRef);
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [deviceId, deviceName, keyPair.publicKey, keyPair.secretKey, reconnectToken, relayUrl]);

  useEffect(() => {
    if (applyingRemoteChangeRef.current) {
      applyingRemoteChangeRef.current = false;
      return;
    }

    const socket = socketRef.current;
    const peer = pairedDeviceRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !peer || !clipboardText) {
      return;
    }

    if (clipboardText === lastSentTextRef.current) {
      return;
    }

    const message: ClipMessage = {
      id: `${deviceId}-${Date.now()}`,
      deviceId,
      type: "text",
      payload: encodeText(clipboardText),
      timestamp: Date.now(),
    };

    const { nonce, ciphertext } = encrypt(
      serialize(message),
      peer.publicKey,
      keyPair.secretKey,
    );

    socket.send(
      toSocketBinary(
        encodeRelayFrame({
          kind: "sealed-clip",
          senderDeviceId: deviceId,
          nonce,
          ciphertext,
        }),
      ),
    );

    lastSentTextRef.current = clipboardText;
    setLastSyncedText(clipboardText);
    setHistory((current) => makeHistory(current, clipboardText));
  }, [clipboardText, deviceId, keyPair.secretKey, pairedDevice]);

  const startPairing = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      toSocketBinary(
        encodeRelayFrame({
          kind: "pair-request",
          pin: pairPin,
          device: {
            deviceId,
            name: deviceName,
            platform: "desktop",
            publicKey: keyPair.publicKey,
          },
        }),
      ),
    );
  };

  const acceptPairing = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      toSocketBinary(
        encodeRelayFrame({
          kind: "pair-accept",
          pin: pairPin,
          device: {
            deviceId,
            name: deviceName,
            platform: "desktop",
            publicKey: keyPair.publicKey,
          },
        }),
      ),
    );
  };

  return {
    connectionStatus,
    deviceId,
    publicKeyBase64,
    pairedDevice,
    history,
    lastSyncedText,
    pairPin,
    setPairPin,
    startPairing,
    acceptPairing,
  };
}

function makeHistory(current: string[], text: string): string[] {
  return [text, ...current.filter((entry) => entry !== text)].slice(0, 20);
}

function loadOrCreateKeyPair(): KeyPair {
  const stored = globalThis.localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as StoredKeyPair;
    return {
      publicKey: decodeBase64(parsed.publicKey),
      secretKey: decodeBase64(parsed.secretKey),
    };
  }

  const keyPair = generateKeyPair();
  const serialized: StoredKeyPair = {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey),
  };

  globalThis.localStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(serialized));
  return keyPair;
}

function loadStoredPairedDevice(): DeviceInfo | null {
  const stored = globalThis.localStorage.getItem(PAIRED_DEVICE_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as StoredDeviceInfo;
    return {
      deviceId: parsed.deviceId,
      name: parsed.name,
      platform: parsed.platform,
      publicKey: decodeBase64(parsed.publicKey),
    };
  } catch {
    clearStoredPairedDevice();
    return null;
  }
}

function storePairedDevice(device: DeviceInfo): void {
  const serialized: StoredDeviceInfo = {
    deviceId: device.deviceId,
    name: device.name,
    platform: device.platform,
    publicKey: encodeBase64(device.publicKey),
  };

  globalThis.localStorage.setItem(PAIRED_DEVICE_STORAGE_KEY, JSON.stringify(serialized));
}

function clearStoredPairedDevice(): void {
  globalThis.localStorage.removeItem(PAIRED_DEVICE_STORAGE_KEY);
}

function scheduleReconnect(
  reconnectTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setReconnectToken: Dispatch<SetStateAction<number>>,
): void {
  if (reconnectTimerRef.current !== null) {
    return;
  }

  reconnectTimerRef.current = setTimeout(() => {
    reconnectTimerRef.current = null;
    setReconnectToken((current) => current + 1);
  }, RECONNECT_DELAY_MS);
}

function clearReconnectTimer(
  reconnectTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  if (reconnectTimerRef.current === null) {
    return;
  }

  clearTimeout(reconnectTimerRef.current);
  reconnectTimerRef.current = null;
}

async function readBinaryMessage(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }

  if (typeof data === "string") {
    try {
      return decodeBase64(data);
    } catch {
      return null;
    }
  }

  return null;
}

function toSocketBinary(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
