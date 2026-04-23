import React from "react";
import {
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

interface PairingScreenProps {
  relayUrl: string;
  pairPin: string;
  onPairPinChange: (value: string) => void;
  publicKeyBase64: string;
  requesterPublicKey: string;
  onRequesterPublicKeyChange: (value: string) => void;
  onStartPairing: () => void;
  onAcceptPairing: () => void;
  onDone: () => void;
}

export function PairingScreen({
  relayUrl,
  pairPin,
  onPairPinChange,
  publicKeyBase64,
  requesterPublicKey,
  onRequesterPublicKeyChange,
  onStartPairing,
  onAcceptPairing,
  onDone,
}: PairingScreenProps) {
  const qrValue = JSON.stringify({
    relayUrl,
    pin: pairPin,
    publicKey: publicKeyBase64,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair a device</Text>
      <Text style={styles.subtitle}>
        Show this QR code to the other device, or paste a requester public key if you are accepting a pairing request from a scanned payload.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Pair PIN</Text>
        <TextInput style={styles.input} value={pairPin} onChangeText={onPairPinChange} />
        <View style={styles.qrCard}>
          <QRCode value={qrValue} size={220} />
        </View>
        <Button title="Start Pairing Request" onPress={onStartPairing} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Requester public key (base64)</Text>
        <TextInput
          multiline
          style={[styles.input, styles.textarea]}
          value={requesterPublicKey}
          onChangeText={onRequesterPublicKeyChange}
        />
        <Button title="Accept Pairing" onPress={onAcceptPairing} />
      </View>

      <Button title="Back to Home" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    padding: 20,
    backgroundColor: "#f8f3ea",
  },
  title: {
    marginTop: 32,
    fontSize: 28,
    fontWeight: "700",
    color: "#1b1d22",
  },
  subtitle: {
    color: "#5f5349",
    lineHeight: 22,
  },
  card: {
    padding: 18,
    gap: 12,
    borderRadius: 20,
    backgroundColor: "#fffaf3",
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
  qrCard: {
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },
});
