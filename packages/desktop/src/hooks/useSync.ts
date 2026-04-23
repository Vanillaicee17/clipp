import { useEffect, useMemo, useRef, useState } from "react";
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

interface StoredKeyPair {
  publicKey: string;
  secretKey: string;
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
  requesterPublicKey: string;
  setRequesterPublicKey: (publicKey: string) => void;
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
  const [pairedDevice, setPairedDevice] = useState<DeviceInfo | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lastSyncedText, setLastSyncedText] = useState("");
  const [pairPin, setPairPin] = useState(createPin());
  const [requesterPublicKey, setRequesterPublicKey] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
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
      setPairedDevice(null);
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }

    const socket = new WebSocket(relayUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    setConnectionStatus("connecting");

    socket.onopen = () => {
      setConnectionStatus("connected");
    };

    socket.onmessage = async (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        return;
      }

      const frame = decodeRelayFrame(new Uint8Array(event.data));

      switch (frame.kind) {
        case "pair-complete":
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
          setPairedDevice(null);
          setConnectionStatus("connected");
          break;
        case "error":
          console.warn(`[clipp] ${frame.code}: ${frame.message}`);
          break;
        case "pair-request":
        case "pair-accept":
          break;
      }
    };

    socket.onclose = () => {
      setConnectionStatus("disconnected");
      setPairedDevice(null);
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [keyPair.secretKey, relayUrl]);

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
      encodeRelayFrame({
        kind: "sealed-clip",
        senderDeviceId: deviceId,
        nonce,
        ciphertext,
      }),
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
    );
  };

  const acceptPairing = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !requesterPublicKey) {
      return;
    }

    socket.send(
      encodeRelayFrame({
        kind: "pair-accept",
        pin: pairPin,
        requesterPublicKey: decodeBase64(requesterPublicKey),
        device: {
          deviceId,
          name: deviceName,
          platform: "desktop",
          publicKey: keyPair.publicKey,
        },
      }),
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
    requesterPublicKey,
    setRequesterPublicKey,
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
