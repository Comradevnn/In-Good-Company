import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '../theme/colors';
import { radii, type } from '../theme/tokens';
import PrimaryButton from '../components/PrimaryButton';
import { Chip, ErrorText, Headline, HeroField, Icon, Input, LinkButton, Screen, TopBar } from '../components/AppParts';
import DateField from '../components/DateField';
import { BACKEND_URL } from '../config/api';
import { nameMatches, dobMatchesAge, dobIsAdult, expiryIsValid } from '../verification/localChecks';

// Identity verification, prototype scope (see the planning decisions +
// specs/identity-verification-encryption-spec.md):
// - Extraction is STUBBED: the user photographs their ID and types the
//   fields; no scanning SDK yet. A pass means "completed the flow," not
//   "identity confirmed" — hence the badge reads "Verified (preview)".
// - No selfie/face-match, no biometric data, no consent screen owed yet.
// - The ID photo is discarded the moment the flow completes (nothing
//   retained on device or server).
// - D6 (server-side hashing): the attestation result + the document fields
//   leave the device over TLS; the server checks for duplicate use, keeps
//   only an irreversible HMAC of the number, and never stores or logs the
//   number itself. The photo never leaves the device.
// - Copy reflects the spec's instant on-device design, not plotline.html's
//   stale "2-3 business days" human-review text.
// Shown when the ID's date of birth makes the holder under 18, whether the
// device or the server caught it. Kept kind: a minor did nothing wrong.
const UNDERAGE_MESSAGE =
  'In Good Company is for adults 18 and over, so we can\'t verify this ID. Thanks for your interest. We\'d love to have you back once you\'re 18.';

// The date-of-birth wheel opens on a plausible adult birthday rather than
// today, so nobody has to scroll back decades from the current year.
const DOB_PICKER_START = new Date(new Date().getFullYear() - 30, 0, 1);

const DOC_TYPES = ["Driver's license", 'Passport', 'State ID'];

// Stable identity slugs for the server's normalized document identity —
// display labels can change; these must not.
const DOC_TYPE_SLUGS = {
  "Driver's license": 'drivers_license',
  Passport: 'passport',
  'State ID': 'state_id',
};

export default function VerifyIdScreen({ sessionToken, profile, onVerified, onCancel }) {
  const [phase, setPhase] = useState('form'); // 'form' | 'review'
  const [docType, setDocType] = useState(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [idName, setIdName] = useState('');
  const [dob, setDob] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('');
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
      // Strict, separate from the typo-tolerant check above: decided from
      // the document's own date of birth, not the typed age. Only this
      // boolean is sent; the date of birth itself never leaves the device.
      dob_is_adult: dobIsAdult(dob),
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
    } else if (!results.dob_is_adult) {
      setError(UNDERAGE_MESSAGE);
    } else if (!results.expiry_ok) {
      setError('This document is expired (or the date is invalid).');
    } else {
      setPhase('review');
    }
  }

  async function handleSubmit() {
    setError(null);
    // Belt and braces: the review step is only reachable after the local
    // checks pass, but never submit an under-18 result.
    if (!checks?.dob_is_adult) {
      setError(UNDERAGE_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      // D6: the document fields go to the server over TLS; the server
      // computes and checks the irreversible hash and stores only that —
      // never the number itself.
      const checkResponse = await fetch(`${BACKEND_URL}/verification/document-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          document_type: DOC_TYPE_SLUGS[docType],
          issuing_country: issuingCountry.trim(),
          document_number: docNumber.trim(),
        }),
      });
      const check = await checkResponse.json();
      if (!checkResponse.ok) throw new Error(check.error || 'Could not check the document.');
      if (check.duplicate) {
        throw new Error('This document has already verified another account.');
      }

      const response = await fetch(`${BACKEND_URL}/verification/attest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        // Spec point 8 attestation shape. The document hash is staged
        // server-side by the document-check above — nothing document-related
        // is sent here. Device signature stubbed — hardware-bound keys need
        // a dev build; TLS is the transport trust.
        body: JSON.stringify({
          name_match: checks.name_match,
          dob_match: checks.dob_match,
          dob_is_adult: checks.dob_is_adult,
          doc_type_confirmed: checks.doc_type_confirmed,
          expiry_date: expiry.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.code === 'underage_document' ? UNDERAGE_MESSAGE : data.error || 'Verification failed.'
        );
      }

      await discardPhoto();
      onVerified(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    await discardPhoto();
    onCancel();
  }

  if (phase === 'review') {
    const rows = [
      ['Name on ID', 'Matches profile', true],
      ['Date of birth', 'Consistent with profile', true],
      ['Document type', docType, true],
      ['Not expired', 'Confirmed', true],
      ['Selfie live-match', 'Skipped at this stage', false],
    ];
    return (
      <Screen
        hero={<HeroField><TopBar title="Before we send anything" onField style={styles.bar} /></HeroField>}
        footer={(
          <PrimaryButton
            label="Submit for verification"
            onPress={handleSubmit}
            disabled={submitting}
            loading={submitting}
          />
        )}
      >
        <Headline>Here's what matched</Headline>
        <Text style={styles.body}>
          These checks ran on your device. This summary and your document details — never
          your ID photo — are what get sent.
        </Text>

        <View style={styles.rows}>
          {rows.map(([label, value, ok]) => (
            <View key={label} style={styles.reviewRow} accessible accessibilityLabel={`${label}: ${value}`}>
              <Text style={styles.reviewLabel}>{label}</Text>
              <View style={styles.reviewValueLine}>
                {ok ? <Icon name="check" size={20} color={colors.success} /> : null}
                <Text style={[styles.reviewValue, !ok && { color: colors.ink2 }]}>{value}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.body, { marginTop: 16 }]}>
          Your document number is sent securely and checked so one document can't verify
          two accounts. We store only a scrambled, irreversible check-value — never the
          number itself. Your ID photo is deleted from this device the moment you submit.
        </Text>
        <Text style={[styles.body, { marginTop: 8, fontFamily: type.fieldValue.fontFamily }]}>
          Prototype note: document details are typed, not scanned, so your badge will show
          as "Verified (preview)" until real document scanning ships.
        </Text>

        <ErrorText error={error} />
      </Screen>
    );
  }

  return (
    <Screen
      hero={<HeroField><TopBar title="Verify your ID" onBack={cancel} onField style={styles.bar} /></HeroField>}
      footer={(
        <PrimaryButton
          label="Review & submit"
          onPress={runLocalChecks}
          disabled={!docType || !photoUri || !idName.trim() || !dob.trim() || !docNumber.trim() || !issuingCountry.trim() || !expiry.trim()}
        />
      )}
    >
      <Headline>Confirm it's really you</Headline>
      <Text style={styles.body}>
        Checked instantly. We never receive or keep your ID photo, and we store only an
        irreversible check-value of your document number — never the number itself.
      </Text>

      <View style={styles.block}>
        <Text style={styles.label}>What are you verifying with?</Text>
        <View style={styles.chipRow}>
          {DOC_TYPES.map((docLabel) => (
            <Chip
              key={docLabel}
              label={docLabel}
              selected={docType === docLabel}
              onPress={() => setDocType(docLabel)}
            />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Photo of your ID</Text>
        <Pressable
          style={[styles.upload, photoUri && styles.uploadDone]}
          onPress={() => capturePhoto(false)}
          accessibilityRole="button"
          accessibilityLabel={photoUri ? 'Photo captured' : 'Tap to photograph your ID'}
        >
          <View style={[styles.uploadDisc, photoUri && { backgroundColor: colors.success }]}>
            <Icon name={photoUri ? 'check' : 'camera'} size={24} color={photoUri ? colors.onSuccess : colors.ink} />
          </View>
          <Text style={styles.uploadTitle}>
            {photoUri ? 'Photo captured' : 'Tap to photograph your ID'}
          </Text>
          <Text style={[styles.body, { marginTop: 2, textAlign: 'center' }]}>
            Deleted from this device as soon as verification completes — never uploaded.
          </Text>
        </Pressable>
        <LinkButton label="or choose from your library" onPress={() => capturePhoto(true)} />
      </View>

      <View style={styles.notice}>
        <View style={styles.noticeIcon}>
          <Icon name="info" size={20} color={colors.ink} />
        </View>
        <Text style={[styles.noticeText]}>
          Prototype stage: we don't read the document automatically yet — type the details
          below exactly as printed. Automatic scanning replaces this step later.
        </Text>
      </View>

      <Input
        label="Full name, as printed on the ID"
        placeholder="Jordan Michael Smith"
        value={idName}
        onChangeText={setIdName}
        wrapperStyle={styles.block}
      />

      <View style={[styles.block, styles.row]}>
        <View style={styles.flex}>
          <DateField
            label="Date of birth"
            value={dob}
            onChange={(value) => { setDob(value); setError(null); }}
            initialDate={DOB_PICKER_START}
            maximumDate={new Date()}
          />
        </View>
        <View style={styles.flex}>
          <DateField
            label="Expiry date"
            value={expiry}
            onChange={(value) => { setExpiry(value); setError(null); }}
          />
        </View>
      </View>

      <View style={[styles.block, styles.row]}>
        <Input
          label="Document number"
          placeholder="As printed on the document"
          value={docNumber}
          onChangeText={setDocNumber}
          autoCapitalize="characters"
          wrapperStyle={{ flex: 2 }}
        />
        <Input
          label="Issuing country"
          placeholder="US"
          value={issuingCountry}
          onChangeText={setIssuingCountry}
          autoCapitalize="characters"
          wrapperStyle={styles.flex}
        />
      </View>
      <Text style={[styles.body, { marginTop: 12 }]}>
        Sent securely to check that one document can't verify two accounts. We keep only a
        scrambled, irreversible check-value — never the number itself.
      </Text>

      <ErrorText error={error} />

      <LinkButton label="Not now — go back" onPress={cancel} style={{ marginTop: 12 }} />
    </Screen>
  );
}

// The Deeds badge floats top-right under the status bar, so the bar leaves that corner clear.
const styles = StyleSheet.create({
  bar: { paddingRight: 84 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  block: { marginTop: 20 },
  body: { ...type.bodyS, color: colors.ink2, marginTop: 8 },
  label: { ...type.label, color: colors.ink, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rows: { marginTop: 16, gap: 8 },
  reviewRow: { backgroundColor: colors.tint, borderRadius: radii.field, paddingVertical: 12, paddingHorizontal: 16 },
  reviewLabel: { ...type.bodyS, color: colors.ink2 },
  reviewValueLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  reviewValue: { ...type.fieldValue, color: colors.ink, flexShrink: 1 },
  upload: {
    alignItems: 'center',
    padding: 20,
    borderRadius: radii.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.edge,
    backgroundColor: colors.tint,
  },
  uploadDone: { backgroundColor: colors.successTint, borderColor: colors.success },
  uploadDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: { ...type.subtitle, color: colors.ink, marginTop: 8 },
  notice: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    padding: 16,
    borderRadius: radii.notice,
    backgroundColor: colors.accentTint,
  },
  noticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: { ...type.bodyS, color: colors.ink, flex: 1 },
});
