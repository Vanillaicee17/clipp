import React, { useMemo, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import type { PairingPayload } from "@clipp/core";

interface PairingScreenProps {
  pairingStatus: string;
  onScanPairingPayload: (payload: PairingPayload) => void;
  onDone: () => void;
}

export function PairingScreen({
  pairingStatus,
  onScanPairingPayload,
  onDone,
}: PairingScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanningEnabled, setIsScanningEnabled] = useState(true);

  const statusText = useMemo(() => {
    if (scanError) {
      return scanError;
    }

    return pairingStatus;
  }, [pairingStatus, scanError]);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (!isScanningEnabled) {
      return;
    }

    try {
      const payload = parsePairingPayload(data);
      setIsScanningEnabled(false);
      setScanError(null);
      onScanPairingPayload(payload);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "That QR code is not a clipp pairing code.");
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Preparing camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera access is required</Text>
        <Text style={styles.subtitle}>
          clipp uses your camera once to scan the desktop pairing QR code and pull in the relay address and pairing PIN automatically.
        </Text>
        <Button title="Allow Camera" onPress={() => void requestPermission()} />
        <Button title="Back to Home" onPress={onDone} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan the desktop QR code</Text>
      <Text style={styles.subtitle}>
        Point your camera at the QR code shown in the desktop app. clipp will fill in the relay details and accept the pairing request for you.
      </Text>

      <View style={styles.cameraCard}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={isScanningEnabled ? handleBarcodeScanned : undefined}
        />
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Pairing status</Text>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          title="Scan Again"
          onPress={() => {
            setIsScanningEnabled(true);
            setScanError(null);
          }}
        />
        <Button title="Back to Home" onPress={onDone} />
      </View>
    </View>
  );
}

function parsePairingPayload(rawValue: string): PairingPayload {
  const parsed = JSON.parse(rawValue) as Partial<PairingPayload>;
  if (typeof parsed.relayUrl !== "string" || parsed.relayUrl.length === 0) {
    throw new Error("The QR code is missing a relay URL.");
  }

  if (!parsed.relayUrl.startsWith("ws://") && !parsed.relayUrl.startsWith("wss://")) {
    throw new Error("The QR code relay URL must start with ws:// or wss://.");
  }

  if (typeof parsed.pin !== "string" || parsed.pin.length === 0) {
    throw new Error("The QR code is missing a pairing PIN.");
  }

  return {
    relayUrl: parsed.relayUrl,
    pin: parsed.pin,
    publicKey: parsed.publicKey,
    deviceName: parsed.deviceName,
  };
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
  cameraCard: {
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: "#fffaf3",
  },
  camera: {
    minHeight: 360,
  },
  statusCard: {
    padding: 18,
    gap: 8,
    borderRadius: 20,
    backgroundColor: "#fffaf3",
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1b1d22",
  },
  statusText: {
    color: "#5f5349",
    lineHeight: 22,
  },
  actions: {
    gap: 12,
  },
});
