import { useState, type CSSProperties } from "react";

import { useClipboard } from "./hooks/useClipboard";
import { useSync } from "./hooks/useSync";

export default function App() {
  const { clipboardText, setClipboardText } = useClipboard();
  const [relayUrl, setRelayUrl] = useState("ws://localhost:8787");
  const {
    connectionStatus,
    deviceId,
    pairedDevice,
    history,
    lastSyncedText,
    publicKeyBase64,
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

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>clipp desktop</div>
          <h1 style={styles.title}>Encrypted clipboard sync for the devices on your desk.</h1>
          <p style={styles.subtitle}>
            The relay only forwards sealed binary frames. Your clipboard text is encrypted end to end before it leaves this app.
          </p>
        </div>
        <div style={styles.statusCard}>
          <span style={styles.statusLabel}>Connection</span>
          <strong style={styles.statusValue}>{connectionStatus}</strong>
          <span style={styles.metaText}>Device ID: {deviceId}</span>
          <span style={styles.metaText}>
            Paired device: {pairedDevice ? pairedDevice.name : "Not paired"}
          </span>
        </div>
      </section>

      <section style={styles.grid}>
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Relay</h2>
          <label style={styles.label}>
            Relay URL
            <input
              style={styles.input}
              value={relayUrl}
              onChange={(event) => setRelayUrl(event.target.value)}
            />
          </label>
          <label style={styles.label}>
            Pair PIN
            <input
              style={styles.input}
              value={pairPin}
              onChange={(event) => setPairPin(event.target.value)}
            />
          </label>
          <label style={styles.label}>
            Requester public key (base64)
            <textarea
              style={{ ...styles.input, minHeight: 88, resize: "vertical" as const }}
              value={requesterPublicKey}
              onChange={(event) => setRequesterPublicKey(event.target.value)}
            />
          </label>
          <div style={styles.buttonRow}>
            <button style={styles.primaryButton} onClick={startPairing}>
              Start pairing
            </button>
            <button style={styles.secondaryButton} onClick={acceptPairing}>
              Accept pairing
            </button>
          </div>
          <div style={styles.note}>
            Share this public key for manual pairing:
            <pre style={styles.codeBlock}>{publicKeyBase64}</pre>
          </div>
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
    marginBottom: "16px",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    padding: "12px 18px",
    background: "#ba5c2c",
    color: "#fff9f4",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(137, 81, 41, 0.2)",
    borderRadius: "999px",
    padding: "12px 18px",
    background: "#fffaf3",
    color: "#5c4b3c",
    cursor: "pointer",
  },
  note: {
    color: "#5c4b3c",
    lineHeight: 1.5,
  },
  codeBlock: {
    marginTop: "8px",
    padding: "12px",
    borderRadius: "14px",
    background: "#24150d",
    color: "#fce6d6",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
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
