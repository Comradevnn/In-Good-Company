import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from 'js-sha256';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import PrimaryButton from '../components/PrimaryButton';
import { BACKEND_URL } from '../config/api';
import { nameMatches, dobMatchesAge, expiryIsValid } from '../verification/localChecks';

// Identity verification, prototype scope (see the planning decisions +
// specs/identity-verification-encryption-spec.md):
// - Extraction is STUBBED: the user photographs their ID and types the
//   fields; no scanning SDK yet. A pass means "completed the flow," not
//   "identity confirmed" — hence the badge reads "Verified (preview)".
// - No selfie/face-match, no biometric data, no consent screen owed yet.
// - The ID photo is discarded the moment the flow completes (nothing
//   retained on device or server).
// - Only the attestation result + an HMAC of the document number leave the
//   device; the plaintext number and the photo never do (spec points 8-10).
// - Copy reflects the spec's instant on-device design, not plotline.html's
//   stale "2-3 business days" human-review text.
const DOC_TYPES = ["Driver's license", 'Passport', 'State ID'];

export default function VerifyIdScreen({ sessionToken, profile, onVerified, onCancel }) {
  const [phase, setPhase] = useState('form'); // 'form' | 'review'
  const [docType, setDocType] = useState(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [idName, setIdName] = useState('');
  const [dob, setDob] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [checks, setChecks] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function capturePhoto(fromLibrary) {
    setError(null);
    try {
      if (!fromLibrary) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Camera permission denied — you can pick from your library instead.');
        }
      }
      const launcher = fromLibrary
        ? ImagePicker.launchImageLibraryAsync
        : ImagePicker.launchCameraAsync;
      const result = await launcher({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  // Discard the photo per the retention decision — nothing kept on device.
  async function discardPhoto() {
    if (!photoUri) return;
    try {
      await FileSystem.deleteAsync(photoUri, { idempotent: true });
    } catch {
      // Cache file may already be gone; discarding is best-effort.
    }
    setPhotoUri(null);
  }

  function runLocalChecks() {
    setError(null);
    const results = {
      // Spec point 6 — against the profile, on-device (V1/V15 logic).
      name_match: nameMatches(profile?.full_name, idName),
      // Profile stores age, not DOB, so this is an age-consistency check.
      dob_match: dobMatchesAge(dob, profile?.age),
      // Spec point 7 — with manual entry there's no independent extracted
      // type to compare against the claim, so this is trivially the
      // selected chip. STUB: becomes a real cross-check once an SDK
      // extracts the type from the document itself (test V2 waits on that).
      doc_type_confirmed: Boolean(docType),
      expiry_ok: expiryIsValid(expiry),
    };
    setChecks(results);
    if (!results.name_match) {
      setError("The name on the ID doesn't match your profile name.");
    } else if (!results.dob_match) {
      setError("The date of birth doesn't line up with the age on your profile.");
    } else if (!results.expiry_ok) {
      setError('This document is expired (or the date is invalid).');
    } else {
      setPhase('review');
    }
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const configResponse = await fetch(`${BACKEND_URL}/verification/config`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const config = await configResponse.json();
      if (!configResponse.ok) throw new Error(config.error || 'Could not start verification.');

      // HMAC computed on-device: the plaintext document number never
      // reaches the server (spec points 9-10).
      const docHmac = sha256.hmac(config.doc_hmac_pepper, docNumber.trim());

      const response = await fetch(`${BACKEND_URL}/verification/attest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        // Spec point 8 attestation shape. Device signature stubbed —
        // hardware-bound keys need a dev build; TLS is the transport trust.
        body: JSON.stringify({
          name_match: checks.name_match,
          dob_match: checks.dob_match,
          doc_type_confirmed: checks.doc_type_confirmed,
          expiry_date: expiry.trim(),
          doc_hmac: docHmac,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification failed.');

      await discardPhoto();
      onVerified(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'review') {
    return (
      <View style={s.container}>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          <Text style={s.eyebrow}>Before we send anything</Text>
          <Text style={s.h2}>Here's what matched</Text>
          <Text style={s.rationale}>
            These checks ran on your device. This summary — not your ID photo or document
            number — is what gets sent.
          </Text>

          <View style={reviewBox}>
            <ReviewRow label="Name on ID" value="✓ Matches profile" />
            <ReviewRow label="Date of birth" value="✓ Consistent with profile" />
            <ReviewRow label="Document type" value={`✓ ${docType}`} />
            <ReviewRow label="Not expired" value="✓ Confirmed" />
            <ReviewRow label="Selfie live-match" value="— Skipped at this stage" muted />
          </View>

          <Text style={[s.rationale, { marginTop: 14 }]}>
            We send a scrambled, irreversible version of your document number so one document
            can't verify two accounts — the actual number never leaves this device. Your ID
            photo is deleted from this device the moment you submit.
          </Text>
          <Text style={[s.rationale, { marginTop: 8, fontFamily: 'Inter_600SemiBold' }]}>
            Prototype note: document details are typed, not scanned, so your badge will show
            as "Verified (preview)" until real document scanning ships.
          </Text>

          {error ? <Text style={s.errorText}>{error}</Text> : null}
        </ScrollView>
        <PrimaryButton
          label="Submit for verification"
          onPress={handleSubmit}
          disabled={submitting}
          loading={submitting}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text style={s.eyebrow}>Verify your ID</Text>
        <Text style={s.h2}>Confirm it's really you</Text>
        <Text style={s.rationale}>
          Checked instantly, on your device. We never receive your ID photo or document
          number — only the result.
        </Text>

        <View style={s.field}>
          <Text style={s.label}>What are you verifying with?</Text>
          <View style={s.chipGrid}>
            {DOC_TYPES.map((type) => {
              const isSelected = docType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[s.chip, isSelected && s.chipSelected]}
                  onPress={() => setDocType(type)}
                >
                  <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{type}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Photo of your ID</Text>
          <TouchableOpacity style={uploadCard} onPress={() => capturePhoto(false)}>
            <Text style={s.pin}>{photoUri ? '✓' : '🪪'}</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', marginTop: 6, color: colors.ink }}>
              {photoUri ? 'Photo captured' : 'Tap to photograph your ID'}
            </Text>
            <Text style={[s.rationale, { marginTop: 2, textAlign: 'center' }]}>
              Deleted from this device as soon as verification completes — never uploaded.
            </Text>
          </TouchableOpacity>
          <Text style={[s.rationale, { textAlign: 'center', marginTop: 6 }]} onPress={() => capturePhoto(true)}>
            or choose from your library
          </Text>
        </View>

        <View style={stubNotice}>
          <Text style={stubNoticeText}>
            Prototype stage: we don't read the document automatically yet — type the details
            below exactly as printed. Automatic scanning replaces this step later.
          </Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Full name, as printed on the ID</Text>
          <TextInput
            style={s.input}
            placeholder="Jordan Michael Smith"
            placeholderTextColor={colors.inkSoft}
            value={idName}
            onChangeText={setIdName}
          />
        </View>

        <View style={[s.field, s.row]}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Date of birth</Text>
            <TextInput
              style={s.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSoft}
              value={dob}
              onChangeText={setDob}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Expiry date</Text>
            <TextInput
              style={s.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSoft}
              value={expiry}
              onChangeText={setExpiry}
            />
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Document number</Text>
          <TextInput
            style={s.input}
            placeholder="As printed on the document"
            placeholderTextColor={colors.inkSoft}
            value={docNumber}
            onChangeText={setDocNumber}
            autoCapitalize="characters"
          />
          <Text style={[s.rationale, { marginTop: 6 }]}>
            Only a scrambled, irreversible check-value of this number is sent — never the
            number itself.
          </Text>
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <Text
          style={[s.rationale, { textAlign: 'center', marginTop: 20 }]}
          onPress={async () => {
            await discardPhoto();
            onCancel();
          }}
        >
          Not now — go back
        </Text>
      </ScrollView>
      <PrimaryButton
        label="Review & submit"
        onPress={runLocalChecks}
        disabled={!docType || !photoUri || !idName.trim() || !dob.trim() || !docNumber.trim() || !expiry.trim()}
      />
    </KeyboardAvoidingView>
  );
}

function ReviewRow({ label, value, muted }) {
  return (
    <View style={reviewRow}>
      <Text style={reviewLabel}>{label}</Text>
      <Text style={[reviewValue, muted && { color: colors.inkSoft }]}>{value}</Text>
    </View>
  );
}

const reviewBox = {
  marginTop: 16,
  borderWidth: 1.5,
  borderColor: colors.line,
  borderRadius: 14,
  paddingVertical: 6,
  paddingHorizontal: 16,
  backgroundColor: colors.surface,
};
const reviewRow = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingVertical: 8,
};
const reviewLabel = {
  fontFamily: 'Inter_400Regular',
  fontSize: 13.5,
  color: colors.inkSoft,
};
const reviewValue = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 13.5,
  color: colors.mossDark,
};
const uploadCard = {
  borderWidth: 1.5,
  borderStyle: 'dashed',
  borderColor: colors.line,
  borderRadius: 16,
  padding: 20,
  alignItems: 'center',
  backgroundColor: colors.tealTint,
  marginTop: 4,
};
const stubNotice = {
  marginTop: 18,
  borderWidth: 1.5,
  borderColor: colors.ochre,
  borderRadius: 14,
  padding: 13,
  backgroundColor: colors.ochreTint,
};
const stubNoticeText = {
  fontFamily: 'Inter_500Medium',
  fontSize: 12.5,
  lineHeight: 18,
  color: '#8A5A18',
};
