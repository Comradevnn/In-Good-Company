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
import { loadSessionToken, clearSessionToken } from './auth/session';
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
import MatchScreen from './screens/MatchScreen';
import DeedsScreen from './screens/DeedsScreen';
import ProfileScreen from './screens/ProfileScreen';

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
  const [showMatch, setShowMatch] = useState(false);
  const [showDeeds, setShowDeeds] = useState(false);

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

  // Bubbles a fresh deeds_balance (from /matching/cancel or /deeds/purchase)
  // back into profile, so the top-right badge and ProfileScreen stay in
  // sync without a full re-fetch.
  function handleDeedsChange(newBalance) {
    if (newBalance == null) return;
    setProfile((prev) => (prev ? { ...prev, deeds_balance: newBalance } : prev));
  }

  // Testing convenience for switching between accounts — clears the stored
  // token and resets everything back to the signup screen's starting state.
  function handleLogOut() {
    clearSessionToken();
    setProfile(null);
    setFlow(CAUSE_FLOW);
    setStepIndex(0);
    setResumeState(undefined);
    setShowSettings(false);
    setEditingSection(null);
    setShowVerify(false);
    setShowMatch(false);
    setShowDeeds(false);
    setSessionToken(null);
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
        if (showMatch) {
          return (
            <MatchScreen
              sessionToken={sessionToken}
              onBack={() => setShowMatch(false)}
              onDeedsChange={handleDeedsChange}
            />
          );
        }
        if (showDeeds) {
          return (
            <DeedsScreen
              sessionToken={sessionToken}
              balance={profile?.deeds_balance}
              onBalanceChange={handleDeedsChange}
              onBack={() => setShowDeeds(false)}
            />
          );
        }
        return (
          <ProfileScreen
            profile={profile}
            onVerify={() => setShowVerify(true)}
            onFindMatch={() => setShowMatch(true)}
            onDeeds={() => setShowDeeds(true)}
            onSettings={() => setShowSettings(true)}
          />
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
          onLogOut={handleLogOut}
        />
      );
    }
    return renderOnboardingStep();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.debugBar}>{backendStatus}</Text>
      {sessionToken && profile ? (
        <View style={styles.deedsBadge}>
          <Text style={styles.deedsBadgeText}>🪙 {profile.deeds_balance ?? 0}</Text>
        </View>
      ) : null}
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
  doneText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#20291F',
    textAlign: 'center',
    lineHeight: 22,
  },
  deedsBadge: {
    position: 'absolute',
    top: 26,
    right: 14,
    zIndex: 10,
    backgroundColor: '#20291F',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  deedsBadgeText: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 12,
    color: '#F2EFE4',
  },
});
