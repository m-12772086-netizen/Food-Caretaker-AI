import React, { useState, useRef } from "react";
import { View, StyleSheet, Alert, Platform } from "react-native";
import { Text, Card, ActivityIndicator, TextInput, Button } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import ScanButton from "../../components/ScanButton";
import { analyzeFood } from "../../services/openai";
import { lookupBarcode } from "../../services/openfoodfacts";
import { ScanResult } from "../../types";

const isWeb = Platform.OS === "web";

// Web-only: convert a File to base64
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ScannerScreen() {
  const [loading, setLoading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showBarcodeInput, setShowBarcodeInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const navigateToResults = (result: ScanResult) => {
    router.push({
      pathname: "/results",
      params: { data: JSON.stringify(result) },
    });
  };

  // ── Barcode lookup (manual entry on web) ──
  const handleBarcodeLookup = async () => {
    const code = barcodeInput.trim();
    if (!code) {
      if (isWeb) alert("Please enter a barcode number.");
      else Alert.alert("Error", "Please enter a barcode number.");
      return;
    }
    setLoading(true);
    try {
      const result = await lookupBarcode(code);
      navigateToResults(result);
    } catch (error) {
      if (isWeb) alert("Failed to look up barcode.");
      else Alert.alert("Error", "Failed to look up barcode. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Web: handle file input change (photo or camera capture) ──
  const handleWebFileSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const imageUri = URL.createObjectURL(file);
      const result = await analyzeFood(base64);
      result.imageUri = imageUri;
      navigateToResults(result);
    } catch (error) {
      alert("Failed to analyze image. Please try again.");
    } finally {
      setLoading(false);
      input.value = ""; // reset so same file can be picked again
    }
  };

  // ── Web: take photo using device camera via <input capture> ──
  const handleWebTakePhoto = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // ── Web: pick from gallery via <input> ──
  const handleWebPickImage = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ── Native: pick from gallery using ImagePicker ──
  const handleNativePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant photo library access.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setLoading(true);
      try {
        const asset = pickerResult.assets[0];
        if (asset.base64) {
          const result = await analyzeFood(asset.base64);
          result.imageUri = asset.uri;
          navigateToResults(result);
        }
      } catch (error) {
        Alert.alert("Error", "Failed to analyze image. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Native: take photo using ImagePicker camera ──
  const handleNativeTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required.");
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setLoading(true);
      try {
        const asset = pickerResult.assets[0];
        if (asset.base64) {
          const result = await analyzeFood(asset.base64);
          result.imageUri = asset.uri;
          navigateToResults(result);
        }
      } catch (error) {
        Alert.alert("Error", "Failed to analyze photo. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Analyzing food...
        </Text>
        <Text variant="bodySmall" style={styles.loadingSubtext}>
          This may take a few seconds
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hidden file inputs for web */}
      {isWeb && (
        <View style={{ height: 0, overflow: "hidden" }}>
          <input
            ref={fileInputRef as React.RefObject<HTMLInputElement>}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleWebFileSelected as unknown as React.ChangeEventHandler}
          />
          <input
            ref={cameraInputRef as React.RefObject<HTMLInputElement>}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleWebFileSelected as unknown as React.ChangeEventHandler}
          />
        </View>
      )}

      <Card style={styles.headerCard}>
        <Card.Content style={styles.headerContent}>
          <Text variant="headlineSmall" style={styles.title}>
            Food Scanner
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Scan barcodes or take photos to learn about your food's nutrition and shelf life.
          </Text>
        </Card.Content>
      </Card>

      {/* Barcode: manual entry on web, or camera on native */}
      {showBarcodeInput ? (
        <Card style={styles.barcodeCard}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.barcodeTitle}>
              Enter Barcode Number
            </Text>
            <TextInput
              label="Barcode (e.g. 5000159484695)"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              mode="outlined"
              keyboardType="numeric"
              style={styles.barcodeInput}
            />
            <View style={styles.barcodeButtons}>
              <Button mode="contained" onPress={handleBarcodeLookup} style={styles.lookupButton}>
                Look Up
              </Button>
              <Button mode="text" onPress={() => setShowBarcodeInput(false)}>
                Cancel
              </Button>
            </View>
          </Card.Content>
        </Card>
      ) : (
        <ScanButton
          icon="barcode-scan"
          label={isWeb ? "Enter Barcode" : "Scan Barcode"}
          onPress={() => setShowBarcodeInput(true)}
          color="#4CAF50"
        />
      )}

      <ScanButton
        icon="camera"
        label="Take Food Photo"
        onPress={isWeb ? handleWebTakePhoto : handleNativeTakePhoto}
        color="#2196F3"
      />

      <ScanButton
        icon="image"
        label="Pick from Gallery"
        onPress={isWeb ? handleWebPickImage : handleNativePickImage}
        color="#FF9800"
      />

      <Card style={styles.infoCard}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.infoTitle}>
            How it works
          </Text>
          <Text variant="bodySmall" style={styles.infoText}>
            Barcode: {isWeb ? "Enter" : "Scan"} the barcode number to look up nutrition info, expiration dates, and storage tips.
          </Text>
          <Text variant="bodySmall" style={styles.infoText}>
            Photo: AI analyzes your food photo to identify the item and estimate its shelf life and nutritional content.
          </Text>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingTop: 8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  loadingText: {
    marginTop: 16,
    fontWeight: "bold",
  },
  loadingSubtext: {
    marginTop: 4,
    color: "#888",
  },
  headerCard: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  headerContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    color: "#666",
    textAlign: "center",
  },
  barcodeCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  barcodeTitle: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  barcodeInput: {
    marginBottom: 12,
  },
  barcodeButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  lookupButton: {
    backgroundColor: "#4CAF50",
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  infoTitle: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  infoText: {
    color: "#666",
    marginBottom: 6,
    lineHeight: 18,
  },
});
