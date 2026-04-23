import { useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import type { PairingPayload } from "@clipp/core";

import { useClipboard } from "./hooks/useClipboard";
import { useSync } from "./hooks/useSync";
import { HomeScreen } from "./screens/HomeScreen";
import { PairingScreen } from "./screens/PairingScreen";

const RELAY_URL_STORAGE_KEY = "clipp.mobile.relay-url";

export default function App() {
  const [showPairing, setShowPairing] = useState(false);
  const [relayUrl, setRelayUrl] = useState("");
  const [pendingPairingPayload, setPendingPairingPayload] = useState<PairingPayload | null>(null);
  const autoAcceptKeyRef = useRef<string | null>(null);
  const { clipboardText, setClipboardText } = useClipboard();
  const {
    connectionStatus,
    isReady,
    startupError,
    deviceId,
    pairedDevice,
    history,
    lastSyncedText,
    setPairPin,
    acceptPairing,
  } = useSync({
    clipboardText,
    relayUrl,
    setClipboardText,
  });

  useEffect(() => {
    void SecureStore.getItemAsync(RELAY_URL_STORAGE_KEY).then((storedRelayUrl) => {
      if (storedRelayUrl) {
        setRelayUrl(storedRelayUrl);
      }
    });
  }, []);

  useEffect(() => {
    if (!relayUrl) {
      return;
    }

    void SecureStore.setItemAsync(RELAY_URL_STORAGE_KEY, relayUrl);
  }, [relayUrl]);

  useEffect(() => {
    if (!pendingPairingPayload || !isReady || connectionStatus !== "connected") {
      return;
    }

    const acceptKey = `${pendingPairingPayload.relayUrl}|${pendingPairingPayload.pin}`;
    if (autoAcceptKeyRef.current === acceptKey) {
      return;
    }

    autoAcceptKeyRef.current = acceptKey;
    acceptPairing();
  }, [acceptPairing, connectionStatus, isReady, pendingPairingPayload]);

  useEffect(() => {
    if (connectionStatus === "paired" && pendingPairingPayload) {
      setPendingPairingPayload(null);
      autoAcceptKeyRef.current = null;
      setShowPairing(false);
    }
  }, [connectionStatus, pendingPairingPayload]);

  const pairingStatus = useMemo(() => {
    if (!pendingPairingPayload) {
      return "Waiting for a desktop QR code.";
    }

    if (connectionStatus === "paired") {
      return "Paired. Returning to your clipboard...";
    }

    if (connectionStatus === "connecting") {
      return `Connecting to ${pendingPairingPayload.relayUrl}...`;
    }

    if (connectionStatus === "connected") {
      return "Desktop found. Accepting the pairing request...";
    }

    return "QR scanned. Waiting for the secure connection to come up...";
  }, [connectionStatus, pendingPairingPayload]);

  if (!isReady) {
    return (
      <HomeScreen
        clipboardText={clipboardText}
        onClipboardTextChange={(value) => {
          void setClipboardText(value);
        }}
        connectionStatus={startupError ? "startup-error" : "starting"}
        pairedDeviceName={startupError ?? "Preparing secure local keys..."}
        lastSyncedText={lastSyncedText}
        history={history}
        onOpenPairing={() => setShowPairing(true)}
      />
    );
  }

  if (showPairing) {
    return (
      <PairingScreen
        pairingStatus={pairingStatus}
        onScanPairingPayload={(payload) => {
          autoAcceptKeyRef.current = null;
          setPendingPairingPayload(payload);
          setRelayUrl(payload.relayUrl);
          setPairPin(payload.pin);
        }}
        onDone={() => setShowPairing(false)}
      />
    );
  }

  return (
    <HomeScreen
      clipboardText={clipboardText}
      onClipboardTextChange={(value) => {
        void setClipboardText(value);
      }}
      connectionStatus={connectionStatus}
      pairedDeviceName={pairedDevice ? `${pairedDevice.name} (${pairedDevice.deviceId})` : deviceId}
      lastSyncedText={lastSyncedText}
      history={history}
      onOpenPairing={() => setShowPairing(true)}
    />
  );
}
