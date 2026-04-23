import { useState } from "react";

import { useClipboard } from "./hooks/useClipboard";
import { useSync } from "./hooks/useSync";
import { HomeScreen } from "./screens/HomeScreen";
import { PairingScreen } from "./screens/PairingScreen";

export default function App() {
  const [showPairing, setShowPairing] = useState(false);
  const [relayUrl, setRelayUrl] = useState("ws://localhost:8787");
  const { clipboardText, setClipboardText } = useClipboard();
  const {
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
  } = useSync({
    clipboardText,
    relayUrl,
    setClipboardText,
  });

  if (showPairing) {
    return (
      <PairingScreen
        relayUrl={relayUrl}
        pairPin={pairPin}
        onPairPinChange={setPairPin}
        publicKeyBase64={publicKeyBase64}
        requesterPublicKey={requesterPublicKey}
        onRequesterPublicKeyChange={setRequesterPublicKey}
        onStartPairing={startPairing}
        onAcceptPairing={acceptPairing}
        onDone={() => setShowPairing(false)}
      />
    );
  }

  return (
    <HomeScreen
      relayUrl={relayUrl}
      onRelayUrlChange={setRelayUrl}
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
