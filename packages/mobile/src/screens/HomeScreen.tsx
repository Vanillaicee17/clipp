import React from "react";
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

interface HomeScreenProps {
  clipboardText: string;
  onClipboardTextChange: (value: string) => void;
  connectionStatus: string;
  pairedDeviceName: string;
  lastSyncedText: string;
  history: string[];
  onOpenPairing: () => void;
}

export function HomeScreen({
  clipboardText,
  onClipboardTextChange,
  connectionStatus,
  pairedDeviceName,
  lastSyncedText,
  history,
  onOpenPairing,
}: HomeScreenProps) {
  const isPaired = connectionStatus === "paired";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>clipp mobile</Text>
        <Text style={styles.title}>Scan your desktop once, then watch your clipboard stay in step.</Text>
        <Text style={styles.subtitle}>
          The phone now expects the desktop to advertise everything it needs in one QR code: relay address, pairing PIN, and the live pairing request.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{isPaired ? "Connected Desktop" : "Desktop Pairing"}</Text>
        <View style={styles.metrics}>
          <Text style={styles.metric}>Status: {connectionStatus}</Text>
          <Text style={styles.metric}>{isPaired ? `Connected to ${pairedDeviceName}` : "Not paired yet"}</Text>
        </View>
        <Text style={styles.helperText}>
          {isPaired
            ? "If you ever want to switch desktops, scan a new QR code from the desktop app."
            : "Open clipp on your desktop and point your camera at the pairing QR code."}
        </Text>
        <Button title={isPaired ? "Scan Another Desktop" : "Scan Desktop QR"} onPress={onOpenPairing} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Clipboard</Text>
        <TextInput
          multiline
          style={[styles.input, styles.textarea]}
          value={clipboardText}
          onChangeText={onClipboardTextChange}
        />
        <Text style={styles.metric}>Last synced item: {lastSyncedText || "Nothing synced yet"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyState}>Your latest synced items will show up here.</Text>
        ) : (
          history.map((entry) => (
            <View key={entry} style={styles.historyItem}>
              <Text style={styles.historyText}>{entry}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
    backgroundColor: "#f8f3ea",
  },
  hero: {
    gap: 10,
    paddingTop: 24,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#9d522d",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1b1d22",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5f5349",
  },
  card: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#fffaf3",
    gap: 12,
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1b1d22",
  },
  input: {
    borderWidth: 1,
    borderColor: "#dbcbb8",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#ffffff",
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  metrics: {
    gap: 4,
  },
  metric: {
    color: "#5f5349",
  },
  helperText: {
    color: "#7a634f",
    lineHeight: 20,
  },
  historyItem: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },
  historyText: {
    color: "#1b1d22",
  },
  emptyState: {
    color: "#8d7158",
  },
});
