import React from "react";
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface HomeScreenProps {
  relayUrl: string;
  onRelayUrlChange: (value: string) => void;
  clipboardText: string;
  onClipboardTextChange: (value: string) => void;
  connectionStatus: string;
  pairedDeviceName: string;
  lastSyncedText: string;
  history: string[];
  onOpenPairing: () => void;
}

export function HomeScreen({
  relayUrl,
  onRelayUrlChange,
  clipboardText,
  onClipboardTextChange,
  connectionStatus,
  pairedDeviceName,
  lastSyncedText,
  history,
  onOpenPairing,
}: HomeScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>clipp mobile</Text>
        <Text style={styles.title}>Move clipboard text between your phone and desktop without exposing plaintext to the relay.</Text>
        <Text style={styles.subtitle}>
          Pair once, then let encrypted clipboard updates flow in both directions over a binary WebSocket stream.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Relay URL</Text>
        <TextInput style={styles.input} value={relayUrl} onChangeText={onRelayUrlChange} />
        <View style={styles.metrics}>
          <Text style={styles.metric}>Status: {connectionStatus}</Text>
          <Text style={styles.metric}>Paired device: {pairedDeviceName}</Text>
        </View>
        <Button title="Open Pairing" onPress={onOpenPairing} />
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
