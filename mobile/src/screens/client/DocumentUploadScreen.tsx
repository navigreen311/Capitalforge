import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientDocumentType = 'receipt' | 'invoice' | 'statement' | 'tax_form';

interface DocumentMeta {
  value: ClientDocumentType;
  label: string;
  icon: string;
  description: string;
}

interface UploadedDocument {
  id: string;
  type: ClientDocumentType;
  filename: string;
  uploadedAt: string;
  status: 'processing' | 'accepted' | 'rejected';
  url?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES: DocumentMeta[] = [
  { value: 'receipt',   label: 'Receipt',         icon: '◎', description: 'Business expense receipt' },
  { value: 'invoice',   label: 'Invoice',          icon: '≡', description: 'Vendor or client invoice' },
  { value: 'statement', label: 'Bank Statement',   icon: '$', description: 'Monthly account statement' },
  { value: 'tax_form',  label: 'Tax Form',         icon: '✦', description: 'W-2, 1099, or business return' },
];

const STATUS_COLOR = {
  processing: Colors.info,
  accepted: Colors.success,
  rejected: Colors.error,
};

const STATUS_BG = {
  processing: Colors.infoLight,
  accepted: Colors.successLight,
  rejected: Colors.errorLight,
};

// ─── Mock recent uploads ──────────────────────────────────────────────────────

const MOCK_UPLOADS: UploadedDocument[] = [
  { id: 'u1', type: 'statement', filename: 'statement_march_2026.jpg', uploadedAt: '2026-03-28', status: 'accepted' },
  { id: 'u2', type: 'receipt',   filename: 'receipt_1234.jpg',         uploadedAt: '2026-03-22', status: 'processing' },
  { id: 'u3', type: 'tax_form',  filename: 'tax_return_2025.jpg',      uploadedAt: '2026-03-10', status: 'accepted' },
  { id: 'u4', type: 'invoice',   filename: 'invoice_5678.jpg',         uploadedAt: '2026-03-05', status: 'rejected' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function DocTypeSelector({
  selected,
  onSelect,
}: {
  selected: ClientDocumentType | null;
  onSelect: (t: ClientDocumentType) => void;
}) {
  return (
    <View style={styles.docTypeGrid}>
      {DOCUMENT_TYPES.map(({ value, label, icon, description }) => {
        const active = selected === value;
        return (
          <TouchableOpacity
            key={value}
            style={[styles.docTypeCard, active && styles.docTypeCardActive]}
            onPress={() => onSelect(value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.docTypeIcon, active && { color: Colors.gold }]}>{icon}</Text>
            <Text style={[styles.docTypeLabel, active && { color: Colors.navy }]}>{label}</Text>
            <Text style={styles.docTypeDesc} numberOfLines={1}>{description}</Text>
            {active && (
              <View style={styles.activeCheck}>
                <Text style={styles.activeCheckText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any }]} />
    </View>
  );
}

function RecentUploadRow({ doc }: { doc: UploadedDocument }) {
  const meta = DOCUMENT_TYPES.find((d) => d.value === doc.type);
  return (
    <View style={styles.uploadRow}>
      <View style={[styles.uploadIconWrap, { backgroundColor: Colors.navyLight }]}>
        <Text style={styles.uploadIcon}>{meta?.icon ?? '◎'}</Text>
      </View>
      <View style={styles.uploadInfo}>
        <Text style={styles.uploadFilename} numberOfLines={1}>{doc.filename}</Text>
        <Text style={styles.uploadDate}>{meta?.label} · {doc.uploadedAt}</Text>
      </View>
      <View style={[styles.uploadStatusBadge, { backgroundColor: STATUS_BG[doc.status] }]}>
        <Text style={[styles.uploadStatusText, { color: STATUS_COLOR[doc.status] }]}>
          {doc.status}
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentUploadScreen() {
  const queryClient = useQueryClient();

  const [permission, requestPermission] = useCameraPermissions();
  const [selectedType, setSelectedType] = useState<ClientDocumentType | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [uploadProgress, setUploadProgress] = useState(0);

  const cameraRef = React.useRef<CameraView>(null);

  // Recent uploads query
  const { data: uploadsData } = useQuery<UploadedDocument[]>({
    queryKey: ['client', 'documents'],
    queryFn: async () => MOCK_UPLOADS,
    placeholderData: MOCK_UPLOADS,
  });
  const recentUploads = uploadsData ?? MOCK_UPLOADS;

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ uri, type }: { uri: string; type: ClientDocumentType }) => {
      // Simulate upload with progress ticks
      for (let i = 1; i <= 5; i++) {
        await new Promise<void>((res) => setTimeout(res, 300));
        setUploadProgress(i / 5);
      }
      // Real call: replace with documentsApi.upload(clientId, type, uri, 'image/jpeg', filename)
      return { id: `u${Date.now()}`, url: uri };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', 'documents'] });
      Alert.alert(
        'Upload Complete',
        'Your document has been submitted and is pending review.',
        [{
          text: 'Upload Another', onPress: () => {
            setCapturedUri(null);
            setSelectedType(null);
            setUploadProgress(0);
          },
        }],
      );
    },
    onError: (err: any) => {
      setUploadProgress(0);
      Alert.alert('Upload Failed', err?.message ?? 'Please try again.');
    },
  });

  async function openCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Required', 'Enable camera access in Settings to capture documents.');
        return;
      }
    }
    if (!selectedType) {
      Alert.alert('Select Type', 'Choose a document type before capturing.');
      return;
    }
    setCameraOpen(true);
  }

  function openGallery() {
    if (!selectedType) {
      Alert.alert('Select Type', 'Choose a document type before selecting from gallery.');
      return;
    }
    // In production: use expo-image-picker
    Alert.alert(
      'Gallery',
      'In production, this opens expo-image-picker. Simulating a selection.',
      [{
        text: 'Simulate Select',
        onPress: () => setCapturedUri('gallery://mock-document'),
      }, { text: 'Cancel', style: 'cancel' }],
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo) {
        setCapturedUri(photo.uri);
        setCameraOpen(false);
      }
    } catch {
      Alert.alert('Capture Error', 'Failed to capture. Please try again.');
    }
  }

  function handleUpload() {
    if (!capturedUri || !selectedType) return;
    uploadMutation.mutate({ uri: capturedUri, type: selectedType });
  }

  // ── Camera View ──
  if (cameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraGuide} />
            <Text style={styles.cameraHint}>Position document within frame</Text>
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.camBtn} onPress={() => setCameraOpen(false)}>
              <Text style={styles.camBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shutterBtn} onPress={takePicture}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.camBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Text style={styles.camBtnText}>⟳ Flip</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Step 1 */}
      <View style={styles.stepHeader}>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
        <Text style={styles.stepTitle}>Select Document Type</Text>
      </View>
      <DocTypeSelector selected={selectedType} onSelect={setSelectedType} />

      {/* Step 2 */}
      <View style={[styles.stepHeader, { marginTop: Spacing[5] }]}>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
        <Text style={styles.stepTitle}>Capture or Choose File</Text>
      </View>

      {capturedUri ? (
        /* Preview */
        <View style={styles.previewCard}>
          <View style={styles.previewThumb}>
            <Text style={styles.previewThumbIcon}>◎</Text>
            <Text style={styles.previewThumbLabel}>Document captured</Text>
            <Text style={styles.previewThumbSub} numberOfLines={1}>{capturedUri.split('/').pop()}</Text>
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => { setCapturedUri(null); setUploadProgress(0); }}
            >
              <Text style={styles.retakeBtnText}>↺ Retake / Change</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.captureActions}>
          <TouchableOpacity
            style={[styles.captureBtn, !selectedType && styles.captureBtnDisabled]}
            onPress={openCamera}
            disabled={!selectedType}
            activeOpacity={0.8}
          >
            <Text style={styles.captureBtnIcon}>◎</Text>
            <Text style={styles.captureBtnLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.captureBtn, !selectedType && styles.captureBtnDisabled]}
            onPress={openGallery}
            disabled={!selectedType}
            activeOpacity={0.8}
          >
            <Text style={styles.captureBtnIcon}>⊞</Text>
            <Text style={styles.captureBtnLabel}>Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 3 — Upload */}
      {capturedUri && (
        <>
          <View style={[styles.stepHeader, { marginTop: Spacing[5] }]}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
            <Text style={styles.stepTitle}>Upload</Text>
          </View>

          <View style={styles.uploadSummary}>
            <View style={styles.uploadSummaryRow}>
              <Text style={styles.uploadSummaryLabel}>Type</Text>
              <Text style={styles.uploadSummaryValue}>
                {DOCUMENT_TYPES.find(d => d.value === selectedType)?.label ?? selectedType}
              </Text>
            </View>
            <View style={styles.uploadSummaryRow}>
              <Text style={styles.uploadSummaryLabel}>File</Text>
              <Text style={styles.uploadSummaryValue} numberOfLines={1}>
                {capturedUri.split('/').pop()}
              </Text>
            </View>
          </View>

          {uploadMutation.isPending && (
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>Uploading… {Math.round(uploadProgress * 100)}%</Text>
              <ProgressBar progress={uploadProgress} />
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.uploadBtn,
              (uploadMutation.isPending || uploadMutation.isSuccess) && styles.uploadBtnDisabled,
            ]}
            onPress={handleUpload}
            disabled={uploadMutation.isPending || uploadMutation.isSuccess}
            activeOpacity={0.85}
          >
            {uploadMutation.isPending ? (
              <ActivityIndicator color={Colors.navy} />
            ) : uploadMutation.isSuccess ? (
              <Text style={styles.uploadBtnText}>✓ Uploaded</Text>
            ) : (
              <Text style={styles.uploadBtnText}>Upload Document</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Recent Uploads */}
      <View style={styles.recentHeader}>
        <Text style={styles.recentTitle}>Recent Uploads</Text>
      </View>
      <View style={styles.recentList}>
        {recentUploads.map((doc, idx) => (
          <React.Fragment key={doc.id}>
            <RecentUploadRow doc={doc} />
            {idx < recentUploads.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },
  content: { padding: Spacing[4], paddingBottom: Spacing[10] },

  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeText: { fontSize: Typography.xs, fontWeight: '800', color: Colors.gold },
  stepTitle: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },

  // Doc type grid
  docTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  docTypeCard: {
    width: '47%',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing[3],
    borderWidth: 2,
    borderColor: Colors.gray200,
    position: 'relative',
    ...Shadow.sm,
  },
  docTypeCardActive: {
    borderColor: Colors.gold,
    backgroundColor: '#FFFCF0',
  },
  docTypeIcon: { fontSize: 22, color: Colors.gray400, marginBottom: 4 },
  docTypeLabel: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray700 },
  docTypeDesc: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  activeCheck: {
    position: 'absolute', top: Spacing[2], right: Spacing[2],
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  activeCheckText: { fontSize: 10, fontWeight: '800', color: Colors.navy },

  // Capture actions
  captureActions: { flexDirection: 'row', gap: Spacing[3], marginBottom: Spacing[4] },
  captureBtn: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: Colors.gold,
    borderStyle: 'dashed',
    paddingVertical: Spacing[6],
    alignItems: 'center',
    gap: Spacing[2],
    ...Shadow.sm,
  },
  captureBtnDisabled: { borderColor: Colors.gray300, opacity: 0.55 },
  captureBtnIcon: { fontSize: 32, color: Colors.gold },
  captureBtnLabel: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },

  // Preview
  previewCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing[4],
    ...Shadow.md,
  },
  previewThumb: {
    backgroundColor: Colors.navy,
    padding: Spacing[6],
    alignItems: 'center',
  },
  previewThumbIcon: { fontSize: 40, color: Colors.gold },
  previewThumbLabel: { fontSize: Typography.md, fontWeight: '600', color: Colors.white, marginTop: Spacing[2] },
  previewThumbSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4, maxWidth: '80%' },
  previewActions: { padding: Spacing[3], alignItems: 'center' },
  retakeBtn: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[2], borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.gray300 },
  retakeBtnText: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray600 },

  // Upload summary
  uploadSummary: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  uploadSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  uploadSummaryLabel: { fontSize: Typography.sm, color: Colors.gray500 },
  uploadSummaryValue: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy, maxWidth: '60%' },

  // Progress
  progressSection: { marginBottom: Spacing[3] },
  progressLabel: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: '600', marginBottom: 6 },
  progressTrack: { height: 8, backgroundColor: Colors.gray100, borderRadius: BorderRadius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: BorderRadius.full },

  // Upload button
  uploadBtn: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: Spacing[6],
    ...Shadow.sm,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },

  // Recent uploads
  recentHeader: { marginBottom: Spacing[3] },
  recentTitle: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },
  recentList: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  uploadIconWrap: {
    width: 38, height: 38, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadIcon: { fontSize: 16, color: Colors.gold },
  uploadInfo: { flex: 1 },
  uploadFilename: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  uploadDate: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },
  uploadStatusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: BorderRadius.full },
  uploadStatusText: { fontSize: Typography.xs, fontWeight: '700', textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[4] },

  // Camera
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraGuide: {
    width: '85%', aspectRatio: 1.41,
    borderWidth: 2, borderColor: Colors.gold,
    borderRadius: BorderRadius.lg,
  },
  cameraHint: {
    marginTop: Spacing[3], color: Colors.white, fontSize: Typography.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[1],
    borderRadius: BorderRadius.full,
  },
  cameraControls: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: Spacing[8], paddingHorizontal: Spacing[6],
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  camBtn: { padding: Spacing[3] },
  camBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: '600' },
  shutterBtn: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 4, borderColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.white },
});
