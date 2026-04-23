import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import QRCode from "react-qr-code";
import { invoke } from "@tauri-apps/api/core";
import { createPin, type PairingPayload } from "@clipp/core";

import { useClipboard } from "./hooks/useClipboard";
import { useSync } from "./hooks/useSync";

const DESKTOP_RELAY_URL = "ws://127.0.0.1:8787";

export default function App() {
  const { clipboardText, setClipboardText } = useClipboard();
  const [shareRelayUrl, setShareRelayUrl] = useState("");
  const [shareRelayError, setShareRelayError] = useState<string | null>(null);
  const pairingRequestedPinRef = useRef<string | null>(null);

  const {
    connectionStatus,
    deviceId,
    pairedDevice,
    history,
    lastSyncedText,
    publicKeyBase64,
    pairPin,
    setPairPin,
    startPairing,
  } = useSync({
    clipboardText,
    relayUrl: DESKTOP_RELAY_URL,
    setClipboardText,
  });

  useEffect(() => {
    void invoke<string>("get_pairing_relay_url")
      .then((resolvedRelayUrl) => {
        setShareRelayUrl(resolvedRelayUrl);
        setShareRelayError(null);
      })
      .catch((error) => {
        setShareRelayError(error instanceof Error ? error.message : "Unable to determine your LAN relay address.");
      });
  }, []);

  useEffect(() => {
    if (connectionStatus !== "connected" || pairedDevice) {
      pairingRequestedPinRef.current = null;
      return;
    }

    if (pairingRequestedPinRef.current === pairPin) {
      return;
    }

    startPairing();
    pairingRequestedPinRef.current = pairPin;
  }, [connectionStatus, pairPin, pairedDevice, startPairing]);

  const pairingPayload = useMemo<PairingPayload | null>(() => {
    if (!shareRelayUrl) {
      return null;
    }

    return {
      relayUrl: shareRelayUrl,
      pin: pairPin,
      publicKey: publicKeyBase64,
      deviceName: "Desktop",
    };
  }, [pairPin, publicKeyBase64, shareRelayUrl]);

  const qrValue = pairingPayload ? JSON.stringify(pairingPayload) : "";

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>clipp desktop</div>
          <h1 style={styles.title}>Open clipp on your phone and scan once. The rest should disappear.</h1>
          <p style={styles.subtitle}>
            The desktop app keeps its own relay connection locally, advertises your LAN pairing details as a QR code, and starts the pairing request for you as soon as the relay is reachable.
          </p>
        </div>
        <div style={styles.statusCard}>
          <span style={styles.statusLabel}>Connection</span>
          <strong style={styles.statusValue}>{connectionStatus}</strong>
          <span style={styles.metaText}>Desktop relay: {DESKTOP_RELAY_URL}</span>
          <span style={styles.metaText}>Device ID: {deviceId}</span>
          <span style={styles.metaText}>
            Paired device: {pairedDevice ? `${pairedDevice.name} (${pairedDevice.deviceId})` : "Waiting for phone"}
          </span>
        </div>
      </section>

      <section style={styles.grid}>
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>{pairedDevice ? "Connected Clipboard" : "Phone Pairing"}</h2>
          {pairedDevice ? (
            <>
              <div style={styles.connectedBadge}>Connected to {pairedDevice.name}</div>
              <p style={styles.note}>
                Your phone can reconnect to this desktop automatically after short interruptions. If you want to pair a different device, generate a fresh code below.
              </p>
            </>
          ) : (
            <>
              <p style={styles.note}>
                Open clipp on your phone, tap <strong>Scan Desktop QR</strong>, and point it at this code. The phone will learn the relay URL, pairing PIN, and accept the request automatically.
              </p>
              <div style={styles.qrPanel}>
                {pairingPayload ? (
                  <div style={styles.qrCanvas}>
                    <QRCode value={qrValue} size={220} bgColor="#fffaf3" fgColor="#1f130d" />
                  </div>
                ) : (
                  <div style={styles.qrPlaceholder}>
                    {shareRelayError ?? "Waiting for a LAN relay address so the phone can reach this desktop."}
                  </div>
                )}
              </div>
              <div style={styles.pairingMeta}>
                <span style={styles.metaText}>Phone relay: {shareRelayUrl || "Detecting..."}</span>
                <span style={styles.metaText}>One-time PIN: {pairPin}</span>
              </div>
            </>
          )}
          <div style={styles.buttonRow}>
            <button style={styles.primaryButton} onClick={() => setPairPin(createPin())}>
              Generate New QR
            </button>
          </div>
          {shareRelayError ? <div style={styles.warningBox}>{shareRelayError}</div> : null}
        </div>

        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Clipboard</h2>
          <label style={styles.label}>
            Current clipboard text
            <textarea
              style={{ ...styles.input, minHeight: 128, resize: "vertical" as const }}
              value={clipboardText}
              onChange={(event) => void setClipboardText(event.target.value)}
            />
          </label>
          <div style={styles.note}>Last synced item: {lastSyncedText || "Nothing synced yet"}</div>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>History</h2>
        <div style={styles.history}>
          {history.length === 0 ? (
            <div style={styles.emptyState}>Clipboard history will appear here once sync events start flowing.</div>
          ) : (
            history.map((entry) => (
              <article key={entry} style={styles.historyItem}>
                {entry}
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "32px",
    background:
      "radial-gradient(circle at top left, rgba(255, 214, 153, 0.9), transparent 35%), linear-gradient(180deg, #faf6ef 0%, #f0e6d8 100%)",
    color: "#17202a",
    fontFamily: "'Segoe UI', sans-serif",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)",
    gap: "24px",
    alignItems: "stretch",
    marginBottom: "24px",
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    fontSize: "0.75rem",
    color: "#895129",
    marginBottom: "12px",
  },
  title: {
    margin: 0,
    fontSize: "2.4rem",
    lineHeight: 1.05,
  },
  subtitle: {
    maxWidth: "60ch",
    color: "#5c4b3c",
    lineHeight: 1.5,
  },
  statusCard: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "10px",
    padding: "24px",
    borderRadius: "24px",
    background: "#fff8ef",
    border: "1px solid rgba(137, 81, 41, 0.15)",
    boxShadow: "0 12px 40px rgba(84, 50, 25, 0.08)",
  },
  statusLabel: {
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "#8f6a4f",
  },
  statusValue: {
    fontSize: "1.4rem",
  },
  metaText: {
    color: "#5c4b3c",
    wordBreak: "break-word",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "24px",
    marginBottom: "24px",
  },
  panel: {
    padding: "24px",
    borderRadius: "24px",
    background: "rgba(255, 252, 247, 0.9)",
    border: "1px solid rgba(137, 81, 41, 0.12)",
    boxShadow: "0 8px 30px rgba(84, 50, 25, 0.06)",
  },
  panelTitle: {
    marginTop: 0,
    marginBottom: "20px",
    fontSize: "1.2rem",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "16px",
    color: "#5c4b3c",
  },
  input: {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid rgba(137, 81, 41, 0.2)",
    background: "#ffffff",
    padding: "12px 14px",
    fontSize: "0.95rem",
    color: "#17202a",
    boxSizing: "border-box",
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "16px",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    padding: "12px 18px",
    background: "#ba5c2c",
    color: "#fff9f4",
    cursor: "pointer",
  },
  note: {
    color: "#5c4b3c",
    lineHeight: 1.5,
  },
  qrPanel: {
    marginTop: "16px",
    display: "flex",
    justifyContent: "center",
  },
  qrCanvas: {
    padding: "20px",
    borderRadius: "24px",
    background: "#fffaf3",
    boxShadow: "inset 0 0 0 1px rgba(137, 81, 41, 0.12)",
  },
  qrPlaceholder: {
    minHeight: "220px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    borderRadius: "24px",
    background: "#fff6ec",
    color: "#8f6a4f",
    textAlign: "center",
  },
  pairingMeta: {
    marginTop: "16px",
    display: "grid",
    gap: "6px",
  },
  connectedBadge: {
    display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    padding: "10px 14px",
    borderRadius: "999px",
    background: "#edf7ef",
    color: "#24643b",
    fontWeight: 600,
  },
  warningBox: {
    marginTop: "16px",
    padding: "12px 14px",
    borderRadius: "16px",
    background: "#fff0e2",
    color: "#8a4b1f",
  },
  history: {
    maxHeight: "360px",
    overflowY: "auto",
    display: "grid",
    gap: "12px",
  },
  historyItem: {
    padding: "14px 16px",
    borderRadius: "16px",
    background: "#fff",
    border: "1px solid rgba(137, 81, 41, 0.12)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  emptyState: {
    padding: "18px",
    borderRadius: "16px",
    background: "rgba(255, 248, 239, 0.8)",
    color: "#8f6a4f",
  },
};
