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

export default function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend...');
  // undefined = still reading secure storage; null = signed out; string = token
  const [sessionToken, setSessionToken] = useState(undefined);

  // undefined = not fetched yet; null = fetch failed; 'ready' once resolved
  const [resumeState, setResumeState] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [flow, setFlow] = useState(CAUSE_FLOW);
  const [stepIndex, setStepIndex] = useState(0);

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

  function goNext() {
    setStepIndex((i) => i + 1);
  }

  function choseOrgPath() {
    setFlow(ORG_FLOW);
    goNext();
  }

  function choseCausePath() {
    setFlow(CAUSE_FLOW);
    goNext();
  }

  const total = flow.length - 1; // "done" isn't a numbered onboarding step
  const step = stepIndex + 1;
  const currentScreen = flow[stepIndex];

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
        // Placeholder — the real home screen doesn't exist yet.
        return (
          <View style={styles.done}>
            <Text style={styles.doneText}>
              You're all set — welcome{profile?.display_name ? `, ${profile.display_name}` : ''}.
              {'\n\n'}Home screen coming next.
            </Text>
          </View>
        );
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.debugBar}>{backendStatus}</Text>
      {sessionToken ? renderOnboardingStep() : <EmailCaptureScreen onSignedUp={setSessionToken} />}
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
    backgroundColor: '#FBF9F3',
  },
  doneText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#20291F',
    textAlign: 'center',
    lineHeight: 22,
  },
});
