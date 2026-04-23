import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as SecureStore from "expo-secure-store";
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

const KEYPAIR_STORAGE_KEY = "clipp.mobile.keypair";
const PAIRED_DEVICE_STORAGE_KEY = "clipp.mobile.paired-device";
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
  isReady: boolean;
  startupError: string | null;
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
  deviceName = "Mobile",
}: UseSyncOptions): UseSyncResult {
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [startupError, setStartupError] = useState<string | null>(null);
  const [pairedDevice, setPairedDevice] = useState<DeviceInfo | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const loadKeyPair = async () => {
      try {
        const loadedKeyPair = await loadOrCreateKeyPair();
        const storedPeer = await loadStoredPairedDevice();
        if (!cancelled) {
          setKeyPair(loadedKeyPair);
          setPairedDevice(storedPeer);
          setStartupError(null);
        }
      } catch (error) {
        console.warn("[clipp] mobile keypair load failed, regenerating", error);

        try {
          const regeneratedKeyPair = await regenerateKeyPair();
          const storedPeer = await loadStoredPairedDevice();
          if (!cancelled) {
            setKeyPair(regeneratedKeyPair);
            setPairedDevice(storedPeer);
            setStartupError(null);
          }
        } catch (regenerationError) {
          console.warn("[clipp] mobile keypair regeneration failed", regenerationError);
          if (!cancelled) {
            setStartupError("Unable to initialize secure local keys on this device.");
          }
        }
      }
    };

    void loadKeyPair();

    return () => {
      cancelled = true;
    };
  }, []);

  const deviceId = useMemo(
    () => (keyPair ? deviceIdFromPublicKey(keyPair.publicKey) : ""),
    [keyPair],
  );

  useEffect(() => {
    pairedDeviceRef.current = pairedDevice;
  }, [pairedDevice]);

  useEffect(() => {
    setClipboardTextRef.current = setClipboardText;
  }, [setClipboardText]);

  useEffect(() => {
    if (!keyPair || !relayUrl) {
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
              platform: "mobile",
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
          await storePairedDevice(frame.peer);
          setPairedDevice(frame.peer);
          setConnectionStatus("paired");
          break;
        case "sealed-clip": {
          const peer = pairedDeviceRef.current;
          if (!peer || !keyPair) {
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
          await clearStoredPairedDevice();
          setPairedDevice(null);
          setConnectionStatus("connected");
          break;
        case "error":
          if (frame.code === "resume-failed") {
            await clearStoredPairedDevice();
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
      console.warn("[clipp] mobile socket error", event);
    };

    return () => {
      disposed = true;
      clearReconnectTimer(reconnectTimerRef);
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [deviceId, deviceName, keyPair, reconnectToken, relayUrl]);

  useEffect(() => {
    if (!keyPair || !pairedDevice) {
      return;
    }

    if (applyingRemoteChangeRef.current) {
      applyingRemoteChangeRef.current = false;
      return;
    }

    const socket = socketRef.current;
    const peer = pairedDeviceRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !clipboardText || !peer) {
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
  }, [clipboardText, deviceId, keyPair, pairedDevice]);

  const startPairing = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !keyPair) {
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
            platform: "mobile",
            publicKey: keyPair.publicKey,
          },
        }),
      ),
    );
  };

  const acceptPairing = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !keyPair) {
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
            platform: "mobile",
            publicKey: keyPair.publicKey,
          },
        }),
      ),
    );
  };

  return {
    connectionStatus,
    isReady: keyPair !== null,
    startupError,
    deviceId,
    publicKeyBase64: keyPair ? encodeBase64(keyPair.publicKey) : "",
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

async function loadOrCreateKeyPair(): Promise<KeyPair> {
  const stored = await SecureStore.getItemAsync(KEYPAIR_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as Partial<StoredKeyPair>;
    if (typeof parsed.publicKey !== "string" || typeof parsed.secretKey !== "string") {
      throw new Error("Stored keypair is missing required fields.");
    }

    return {
      publicKey: decodeBase64(parsed.publicKey),
      secretKey: decodeBase64(parsed.secretKey),
    };
  }

  return regenerateKeyPair();
}

async function regenerateKeyPair(): Promise<KeyPair> {
  await SecureStore.deleteItemAsync(KEYPAIR_STORAGE_KEY).catch(() => undefined);

  const keyPair = generateKeyPair();
  const serialized: StoredKeyPair = {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey),
  };
  await SecureStore.setItemAsync(KEYPAIR_STORAGE_KEY, JSON.stringify(serialized));
  return keyPair;
}

async function loadStoredPairedDevice(): Promise<DeviceInfo | null> {
  const stored = await SecureStore.getItemAsync(PAIRED_DEVICE_STORAGE_KEY);
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
    await clearStoredPairedDevice();
    return null;
  }
}

async function storePairedDevice(device: DeviceInfo): Promise<void> {
  const serialized: StoredDeviceInfo = {
    deviceId: device.deviceId,
    name: device.name,
    platform: device.platform,
    publicKey: encodeBase64(device.publicKey),
  };

  await SecureStore.setItemAsync(PAIRED_DEVICE_STORAGE_KEY, JSON.stringify(serialized));
}

async function clearStoredPairedDevice(): Promise<void> {
  await SecureStore.deleteItemAsync(PAIRED_DEVICE_STORAGE_KEY).catch(() => undefined);
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
