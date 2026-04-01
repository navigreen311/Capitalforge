import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../lib/theme';
import { documentsApi } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'business_license'
  | 'ein_letter'
  | 'beneficial_ownership'
  | 'bank_statement'
  | 'tax_return'
  | 'receipt'
  | 'other';

interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
}

interface DocumentCaptureScreenProps {
  route?: {
    params?: {
      clientId?: string;
      documentType?: DocumentType;
    };
  };
  navigation?: {
    goBack: () => void;
  };
}

// ─── Document type labels ─────────────────────────────────────────────────────

const DOCUMENT_TYPES: Array<{ value: DocumentType; label: string; description: string }> = [
  { value: 'business_license', label: 'Business License', description: 'State-issued business operating license' },
  { value: 'ein_letter', label: 'EIN Letter', description: 'IRS EIN assignment letter (CP575)' },
  { value: 'beneficial_ownership', label: 'Beneficial Ownership', description: 'Owners with 25%+ stake certification' },
  { value: 'bank_statement', label: 'Bank Statement', description: 'Last 3 months business bank statements' },
  { value: 'tax_return', label: 'Tax Return', description: 'Most recent 2 years business tax returns' },
  { value: 'receipt', label: 'Receipt / Invoice', description: 'Business expense receipt or invoice' },
  { value: 'other', label: 'Other Document', description: 'Any other supporting document' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentCaptureScreen({ route, navigation }: DocumentCaptureScreenProps) {
  const clientId = route?.params?.clientId ?? '';
  const initialDocType = route?.params?.documentType ?? null;

  const [permission, requestPermission] = useCameraPermissions();
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | null>(initialDocType);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const cameraRef = useRef<CameraView>(null);

  async function handleCapturePress() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera Permission Required',
          'CapitalForge needs camera access to capture documents. Enable it in Settings.',
        );
        return;
      }
    }
    if (!selectedDocType) {
      Alert.alert('Select Document Type', 'Please select the type of document you are capturing.');
      return;
    }
    setCameraActive(true);
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo) {
        setCapturedPhoto({ uri: photo.uri, width: photo.width, height: photo.height });
        setCameraActive(false);
      }
    } catch (err) {
      Alert.alert('Capture Error', 'Failed to capture photo. Please try again.');
    }
  }

  async function handleSubmit() {
    if (!capturedPhoto || !selectedDocType) return;
    if (!clientId) {
      Alert.alert('Missing Client', 'No client selected for this document.');
      return;
    }

    setUploading(true);
    try {
      const filename = `${selectedDocType}_${Date.now()}.jpg`;
      await documentsApi.upload(
        clientId,
        selectedDocType,
        capturedPhoto.uri,
        'image/jpeg',
        filename,
      );
      setUploaded(true);
      Alert.alert(
        'Document Submitted',
        'Your document has been uploaded successfully and is pending review.',
        [{ text: 'Done', onPress: () => navigation?.goBack() }],
      );
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function retake() {
    setCapturedPhoto(null);
    setCameraActive(true);
  }

  // Camera view
  if (cameraActive) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
          {/* Overlay guide */}
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraGuide} />
            <Text style={styles.cameraGuideText}>
              Position document within the frame
            </Text>
          </View>

          {/* Controls */}
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Text style={styles.flipBtnText}>⟳ Flip</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setCameraActive(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Step 1: Select Document Type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Select Document Type</Text>
        <View style={styles.docTypeGrid}>
          {DOCUMENT_TYPES.map(({ value, label, description }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.docTypeCard,
                selectedDocType === value && styles.docTypeCardSelected,
              ]}
              onPress={() => setSelectedDocType(value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.docTypeLabel, selectedDocType === value && styles.docTypeLabelSelected]}>
                {label}
              </Text>
              <Text style={styles.docTypeDesc} numberOfLines={2}>{description}</Text>
              {selectedDocType === value && (
                <View style={styles.docTypeCheck}>
                  <Text style={styles.docTypeCheckText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Step 2: Capture / Preview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Capture or Upload</Text>

        {capturedPhoto ? (
          <View style={styles.previewContainer}>
            {/* In a real app, use <Image> with capturedPhoto.uri */}
            <View style={styles.previewPlaceholder}>
              <Text style={styles.previewPlaceholderIcon}>◎</Text>
              <Text style={styles.previewPlaceholderText}>Photo captured</Text>
              <Text style={styles.previewDimensions}>
                {capturedPhoto.width} × {capturedPhoto.height}
              </Text>
            </View>
            <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
              <Text style={styles.retakeBtnText}>↺ Retake Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.captureZone, !selectedDocType && styles.captureZoneDisabled]}
            onPress={handleCapturePress}
            disabled={!selectedDocType}
            activeOpacity={0.8}
          >
            <Text style={styles.captureZoneIcon}>◎</Text>
            <Text style={styles.captureZoneTitle}>
              {selectedDocType ? 'Tap to Open Camera' : 'Select a document type first'}
            </Text>
            <Text style={styles.captureZoneSubtitle}>
              Position document flat with good lighting
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Step 3: Submit */}
      {capturedPhoto && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Submit Document</Text>

          {clientId && (
            <View style={styles.submitMeta}>
              <Text style={styles.submitMetaLabel}>Client ID</Text>
              <Text style={styles.submitMetaValue}>{clientId}</Text>
            </View>
          )}
          <View style={styles.submitMeta}>
            <Text style={styles.submitMetaLabel}>Document Type</Text>
            <Text style={styles.submitMetaValue}>
              {DOCUMENT_TYPES.find(d => d.value === selectedDocType)?.label ?? selectedDocType}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, (uploading || uploaded) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={uploading || uploaded}
            activeOpacity={0.85}
          >
            {uploading ? (
              <ActivityIndicator color={Colors.navy} />
            ) : uploaded ? (
              <Text style={styles.submitBtnText}>✓ Submitted</Text>
            ) : (
              <Text style={styles.submitBtnText}>Upload Document</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },
  content: { padding: Spacing[4], paddingBottom: Spacing[10] },

  section: { marginBottom: Spacing[6] },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: Spacing[3],
  },

  // Document type grid
  docTypeGrid: { gap: Spacing[2] },
  docTypeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    borderWidth: 2,
    borderColor: Colors.gray200,
    position: 'relative',
    ...Shadow.sm,
  },
  docTypeCardSelected: {
    borderColor: Colors.gold,
    backgroundColor: '#FFFCF0',
  },
  docTypeLabel: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray700 },
  docTypeLabelSelected: { color: Colors.navy },
  docTypeDesc: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 3 },
  docTypeCheck: {
    position: 'absolute',
    top: Spacing[3],
    right: Spacing[3],
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTypeCheckText: { fontSize: 11, fontWeight: '800', color: Colors.navy },

  // Capture zone
  captureZone: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: Colors.gold,
    borderStyle: 'dashed',
    padding: Spacing[8],
    alignItems: 'center',
    ...Shadow.sm,
  },
  captureZoneDisabled: {
    borderColor: Colors.gray300,
    opacity: 0.6,
  },
  captureZoneIcon: { fontSize: 48, color: Colors.gold, marginBottom: Spacing[3] },
  captureZoneTitle: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy, textAlign: 'center' },
  captureZoneSubtitle: { fontSize: Typography.sm, color: Colors.gray500, marginTop: Spacing[1], textAlign: 'center' },

  // Preview
  previewContainer: { alignItems: 'center' },
  previewPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  previewPlaceholderIcon: { fontSize: 40, color: Colors.gold },
  previewPlaceholderText: { fontSize: Typography.md, fontWeight: '600', color: Colors.white, marginTop: Spacing[2] },
  previewDimensions: { fontSize: Typography.xs, color: Colors.gray400, marginTop: Spacing[1] },
  retakeBtn: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[2],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  retakeBtnText: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray600 },

  // Submit
  submitMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    marginBottom: Spacing[2],
  },
  submitMetaLabel: { fontSize: Typography.sm, color: Colors.gray500 },
  submitMetaValue: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  submitBtn: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[4],
    minHeight: 52,
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },

  // Camera
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  cameraGuide: {
    width: '85%',
    aspectRatio: 1.41, // A4 ratio
    borderWidth: 2,
    borderColor: Colors.gold,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'transparent',
  },
  cameraGuideText: {
    color: Colors.white,
    fontSize: Typography.sm,
    marginTop: Spacing[3],
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: BorderRadius.full,
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing[8],
    paddingHorizontal: Spacing[6],
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  flipBtn: { padding: Spacing[3] },
  flipBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: '600' },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captureBtnInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.white,
  },
  cancelBtn: { padding: Spacing[3] },
  cancelBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: '600' },
});
