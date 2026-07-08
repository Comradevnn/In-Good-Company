import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFonts, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { BACKEND_URL } from './config/api';
import { loadSessionToken } from './auth/session';
import { CAUSE_FLOW, ORG_FLOW, determineResumeStep } from './onboarding/resume';
import EmailCaptureScreen from './screens/EmailCaptureScreen';
import QuickProfileScreen from './screens/QuickProfileScreen';
import LocationScreen from './screens/LocationScreen';
import OrgOrCauseScreen from './screens/OrgOrCauseScreen';
import CausesScreen from './screens/CausesScreen';
import PartnerPrefsScreen from './screens/PartnerPrefsScreen';
import AvailabilityScreen from './screens/AvailabilityScreen';
import VerifyIdScreen from './screens/VerifyIdScreen';
import SettingsScreen from './screens/SettingsScreen';

const EDIT_SECTION_TITLES = {
  quickProfile: 'Edit basic profile',
  location: 'Edit location',
  orgOrCause: 'Edit causes / org',
  causes: 'Edit causes',
  partnerPrefs: 'Edit partner preferences',
  availability: 'Edit availability',
};

export default function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend...');
  // undefined = still reading secure storage; null = signed out; string = token
  const [sessionToken, setSessionToken] = useState(undefined);

  // undefined = not fetched yet; null = fetch failed; 'ready' once resolved
  const [resumeState, setResumeState] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [flow, setFlow] = useState(CAUSE_FLOW);
  const [stepIndex, setStepIndex] = useState(0);
  const [showVerify, setShowVerify] = useState(false);

  // Settings: reachable from the "done" placeholder. editingSection is the
  // one onboarding screen currently reopened for editing (null = showing
  // the settings list itself, not editing anything).
  const [showSettings, setShowSettings] = useState(false);
  const [editingSection, setEditingSection] = useState(null);

  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    fetch(`${BACKEND_URL}/hello`)
      .then((response) => response.json())
      .then((data) => setBackendStatus(`Backend says: ${data.message}`))
      .catch((error) => setBackendStatus(`Backend error: ${error.message}`));
  }, []);

  useEffect(() => {
    loadSessionToken()
      .then((token) => setSessionToken(token ?? null))
      .catch(() => setSessionToken(null));
  }, []);

  function loadResumeState() {
    if (!sessionToken) return;
    setResumeState(undefined);
    fetch(`${BACKEND_URL}/users/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then(async (response) => {
        if (response.status === 404) return null;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your profile.');
        return data;
      })
      .then((data) => {
        setProfile(data);
        const { flow: resolvedFlow, stepIndex: resolvedStep } = determineResumeStep(data);
        setFlow(resolvedFlow);
        setStepIndex(resolvedStep);
        setResumeState('ready');
      })
      .catch(() => setResumeState('error'));
  }

  useEffect(() => {
    if (sessionToken) loadResumeState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  if (!fontsLoaded || sessionToken === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (sessionToken && resumeState === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (sessionToken && resumeState === 'error') {
    return (
      <View style={styles.loading}>
        <Text style={styles.doneText}>Couldn't load your profile.</Text>
        <TouchableOpacity onPress={loadResumeState} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Advancing the linear onboarding flow. Each screen's save call returns
  // the updated row, so profile stays fresh even mid-session (previously it
  // only reflected whatever was fetched at launch).
  function goNext(updatedProfile) {
    if (updatedProfile) setProfile(updatedProfile);
    setStepIndex((i) => i + 1);
  }

  function choseOrgPath(updatedProfile) {
    if (updatedProfile) setProfile(updatedProfile);
    setFlow(ORG_FLOW);
    setStepIndex((i) => i + 1);
  }

  function choseCausePath() {
    setFlow(CAUSE_FLOW);
    setStepIndex((i) => i + 1);
  }

  // Returning to Settings after editing one section.
  function finishEditing(updatedProfile) {
    if (updatedProfile) setProfile(updatedProfile);
    setEditingSection(null);
  }

  const total = flow.length - 1; // "done" isn't a numbered onboarding step
  const step = stepIndex + 1;
  const currentScreen = flow[stepIndex];

  function renderEditingScreen() {
    const commonProps = {
      sessionToken,
      initialValues: profile,
      title: EDIT_SECTION_TITLES[editingSection],
      onBack: () => setEditingSection(null),
    };
    switch (editingSection) {
      case 'quickProfile':
        return <QuickProfileScreen {...commonProps} onNext={finishEditing} />;
      case 'location':
        return <LocationScreen {...commonProps} onNext={finishEditing} />;
      case 'orgOrCause':
        return (
          <OrgOrCauseScreen
            {...commonProps}
            onKnowsOrg={finishEditing}
            onBrowseByCause={() => setEditingSection('causes')}
          />
        );
      case 'causes':
        return <CausesScreen {...commonProps} onNext={finishEditing} />;
      case 'partnerPrefs':
        return <PartnerPrefsScreen {...commonProps} onNext={finishEditing} />;
      case 'availability':
        return <AvailabilityScreen {...commonProps} onNext={finishEditing} />;
      default:
        return null;
    }
  }

  function renderOnboardingStep() {
    switch (currentScreen) {
      case 'quickProfile':
        return (
          <QuickProfileScreen
            sessionToken={sessionToken}
            step={step}
            total={total}
            onNext={goNext}
            initialValues={profile}
          />
        );
      case 'location':
        return (
          <LocationScreen
            sessionToken={sessionToken}
            step={step}
            total={total}
            onNext={goNext}
            initialValues={profile}
          />
        );
      case 'orgOrCause':
        return (
          <OrgOrCauseScreen
            sessionToken={sessionToken}
            step={step}
            total={total}
            onKnowsOrg={choseOrgPath}
            onBrowseByCause={choseCausePath}
            initialValues={profile}
          />
        );
      case 'causes':
        return (
          <CausesScreen
            sessionToken={sessionToken}
            step={step}
            total={total}
            onNext={goNext}
            initialValues={profile}
          />
        );
      case 'partnerPrefs':
        return (
          <PartnerPrefsScreen
            sessionToken={sessionToken}
            step={step}
            total={total}
            onNext={goNext}
            initialValues={profile}
          />
        );
      case 'availability':
        return (
          <AvailabilityScreen
            sessionToken={sessionToken}
            step={step}
            total={total}
            onNext={goNext}
            initialValues={profile}
          />
        );
      case 'done':
      default:
        // Placeholder — the real home screen doesn't exist yet. Verification
        // hangs off here per the flow-placement decision: optional, never
        // blocking onboarding ("required before first pairing, not before
        // browsing" — enforcement wired when pairing exists).
        if (showVerify) {
          return (
            <VerifyIdScreen
              sessionToken={sessionToken}
              profile={profile}
              onVerified={(updatedUser) => {
                setProfile(updatedUser);
                setShowVerify(false);
              }}
              onCancel={() => setShowVerify(false)}
            />
          );
        }
        return (
          <View style={styles.done}>
            <Text style={styles.doneText}>
              You're all set — welcome{profile?.display_name ? `, ${profile.display_name}` : ''}.
              {'\n\n'}Home screen coming next.
            </Text>
            {profile?.verified ? (
              <View style={styles.verifiedChip}>
                <Text style={styles.verifiedChipText}>✓ Verified (preview)</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.retryBtn} onPress={() => setShowVerify(true)}>
                <Text style={styles.retryBtnText}>Verify your ID</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.settingsLink} onPress={() => setShowSettings(true)}>
              Account settings
            </Text>
          </View>
        );
    }
  }

  function renderApp() {
    if (!sessionToken) return <EmailCaptureScreen onSignedUp={setSessionToken} />;
    if (showSettings) {
      if (editingSection) return renderEditingScreen();
      return (
        <SettingsScreen
          profile={profile}
          onBack={() => setShowSettings(false)}
          onEditSection={setEditingSection}
          onVerify={() => {
            setShowSettings(false);
            setShowVerify(true);
          }}
        />
      );
    }
    return renderOnboardingStep();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.debugBar}>{backendStatus}</Text>
      {renderApp()}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#FBF9F3',
  },
  retryBtn: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#4F6F52',
  },
  retryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#F6F4EA',
  },
  debugBar: {
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 10,
    color: '#5B6459',
    textAlign: 'center',
    paddingTop: 6,
    paddingBottom: 2,
    backgroundColor: '#EDE7DA',
  },
  done: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 18,
    backgroundColor: '#FBF9F3',
  },
  verifiedChip: {
    flexDirection: 'row',
    backgroundColor: '#DCE9E9',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  verifiedChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#2F5D62',
  },
  doneText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#20291F',
    textAlign: 'center',
    lineHeight: 22,
  },
  settingsLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    color: '#354E37',
  },
});
