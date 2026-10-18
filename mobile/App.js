import { useCallback, useEffect, useState } from 'react';
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
import { installAuthInterceptor, setUnauthorizedHandler } from './api/client';
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
import DeedsScreen from './screens/DeedsScreen';
import ProfileScreen from './screens/ProfileScreen';
import HomeScreen from './screens/HomeScreen';
import StartMatchingScreen from './screens/StartMatchingScreen';
import WaitingScreen from './screens/WaitingScreen';
import PairingScreen from './screens/PairingScreen';
import ChatScreen from './screens/ChatScreen';
import CancelScreen from './screens/CancelScreen';
import BailDecisionScreen from './screens/BailDecisionScreen';
import BookingScreen from './screens/BookingScreen';
import RatingScreen from './screens/RatingScreen';
import BuddiesScreen from './screens/BuddiesScreen';
import PremiumScreen from './screens/PremiumScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import MetricsScreen from './screens/MetricsScreen';
import SafetyScreen from './screens/SafetyScreen';
import OrgOnboardScreen from './screens/OrgOnboardScreen';
import OrgHomeScreen from './screens/OrgHomeScreen';
import OrgShiftFormScreen from './screens/OrgShiftFormScreen';
import OrgRosterScreen from './screens/OrgRosterScreen';

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
  const [showDeeds, setShowDeeds] = useState(false);

  // 'individual' | 'org', from GET /auth/me once a token exists.
  const [accountKind, setAccountKind] = useState(undefined);
  // Post-onboarding screens: a small stack of { name, params } instead of a
  // navigation library — the same manual screen-swapping idea as onboarding.
  const [stack, setStack] = useState([{ name: 'home', params: {} }]);
  // Org side: null = still checking, false = no org row yet, true = set up.
  const [orgReady, setOrgReady] = useState(null);

  // Shown on the sign-in screen after the server ended this session.
  const [signedOutNotice, setSignedOutNotice] = useState(null);

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
    installAuthInterceptor();
  }, []);

  // Any 401 on an authenticated call means the session is gone (signed in
  // elsewhere, or logged out): sign out here too, and say why.
  useEffect(() => {
    if (!sessionToken) return;
    setUnauthorizedHandler(() => {
      resetToSignedOut();
      setSignedOutNotice('You were signed out. Your account was signed in somewhere else.');
    });
  }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSessionToken()
      .then((token) => setSessionToken(token ?? null))
      .catch(() => setSessionToken(null));
  }, []);

  function loadResumeState() {
    if (!sessionToken) return;
    setResumeState(undefined);
    fetch(`${BACKEND_URL}/auth/me`, { headers: { Authorization: `Bearer ${sessionToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((me) => {
        if (me?.kind === 'org') {
          setAccountKind('org');
          return loadOrgState().then(() => setResumeState('ready'));
        }
        setAccountKind('individual');
        return loadVolunteerProfile();
      })
      .catch(() => setResumeState('error'));
  }

  function loadOrgState() {
    return fetch(`${BACKEND_URL}/orgs/mine`, { headers: { Authorization: `Bearer ${sessionToken}` } })
      .then((response) => setOrgReady(response.ok));
  }

  function loadVolunteerProfile() {
    return fetch(`${BACKEND_URL}/users/me`, {
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
      });
  }

  // Re-reads the profile row (e.g. after a search updated the saved
  // availability) without resetting where the user is in the app.
  const refreshProfile = useCallback(() => {
    if (!sessionToken) return;
    fetch(`${BACKEND_URL}/users/me`, { headers: { Authorization: `Bearer ${sessionToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setProfile(data))
      .catch(() => {});
  }, [sessionToken]);

  const handleHomeLoaded = useCallback((home) => {
    setProfile((prev) => (prev && prev.deeds_balance !== home.deeds.available ? { ...prev, deeds_balance: home.deeds.available } : prev));
  }, []);

  // navigate(name, params, { replace, reset }). A few names map onto the
  // existing full-screen flags (verification, Deeds, settings).
  const navigate = useCallback((name, params = {}, options = {}) => {
    if (name === 'verify') return setShowVerify(true);
    if (name === 'deeds') return setShowDeeds(true);
    if (name === 'settings') return setShowSettings(true);
    if (name === 'startMatching') refreshProfile();
    setShowVerify(false);
    setShowDeeds(false);
    setStack((prev) => {
      const entry = { name, params };
      if (options.reset || name === 'home') return [{ name: 'home', params: {} }];
      if (options.replace) return [...prev.slice(0, -1), entry];
      return [...prev, entry];
    });
  }, [refreshProfile]);

  const goBack = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

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
        <Text style={styles.signOutLink} onPress={handleLogOut}>Sign out</Text>
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
    // Best effort: end the session server-side too, then forget it locally.
    if (sessionToken) {
      fetch(`${BACKEND_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` } }).catch(() => {});
    }
    setSignedOutNotice(null);
    resetToSignedOut();
  }

  function resetToSignedOut() {
    setUnauthorizedHandler(null);
    clearSessionToken();
    setProfile(null);
    setFlow(CAUSE_FLOW);
    setStepIndex(0);
    setResumeState(undefined);
    setShowSettings(false);
    setEditingSection(null);
    setShowVerify(false);
    setShowDeeds(false);
    setStack([{ name: 'home', params: {} }]);
    setAccountKind(undefined);
    setOrgReady(null);
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
            onKnowsOrg={(updated) => {
              // An org name alone can't be matched on: pick the closest causes next.
              if (updated) setProfile(updated);
              setEditingSection('causes');
            }}
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
        // Verification hangs off here per the flow-placement decision:
        // optional, never blocking onboarding ("required before first
        // pairing, not before browsing" — matching enforces it).
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
        if (showDeeds) {
          return (
            <DeedsScreen
              sessionToken={sessionToken}
              balance={profile?.deeds_balance}
              onBalanceChange={handleDeedsChange}
              onBack={() => setShowDeeds(false)}
              onPremium={() => navigate('premium')}
            />
          );
        }
        return renderAppView();
    }
  }

  // The post-onboarding app: home dashboard plus everything reachable from it.
  function renderAppView() {
    const { name, params } = stack[stack.length - 1];
    const common = { sessionToken, navigate, onBack: goBack };
    switch (name) {
      case 'startMatching':
        return <StartMatchingScreen {...common} profile={profile} buddy={params.buddy} />;
      case 'editCauses':
        return (
          <CausesScreen
            sessionToken={sessionToken}
            initialValues={profile}
            title="Your causes"
            onBack={goBack}
            onNext={(updated) => {
              if (updated) setProfile(updated);
              goBack();
            }}
          />
        );
      case 'editAvailability':
        return (
          <AvailabilityScreen
            sessionToken={sessionToken}
            initialValues={profile}
            title="When are you free next?"
            onBack={goBack}
            onNext={(updated) => {
              if (updated) setProfile(updated);
              goBack();
            }}
          />
        );
      case 'waiting':
        return <WaitingScreen {...common} onProfileChanged={refreshProfile} />;
      case 'pairing':
        return <PairingScreen key={params.pairingId} {...common} pairingId={params.pairingId} />;
      case 'chat':
        return <ChatScreen {...common} pairingId={params.pairingId} />;
      case 'cancel':
        return <CancelScreen {...common} bookingId={params.bookingId} />;
      case 'bail':
        return <BailDecisionScreen {...common} pairingId={params.pairingId} />;
      case 'booking':
        return <BookingScreen key={params.bookingId} {...common} bookingId={params.bookingId} />;
      case 'rating':
        return <RatingScreen {...common} bookingId={params.bookingId} />;
      case 'buddies':
        return <BuddiesScreen {...common} />;
      case 'premium':
        return <PremiumScreen {...common} />;
      case 'notifications':
        return <NotificationsScreen {...common} />;
      case 'metrics':
        return <MetricsScreen {...common} />;
      case 'safety':
        return <SafetyScreen {...common} pairingId={params.pairingId} partnerName={params.partnerName} />;
      case 'profile':
        return (
          <ProfileScreen
            profile={profile}
            onBack={goBack}
            onVerify={() => setShowVerify(true)}
            onFindMatch={() => navigate('startMatching')}
            onDeeds={() => setShowDeeds(true)}
            onSettings={() => setShowSettings(true)}
          />
        );
      case 'home':
      default:
        return <HomeScreen sessionToken={sessionToken} navigate={navigate} onHomeLoaded={handleHomeLoaded} />;
    }
  }

  // Org accounts get the org-side screens instead of volunteer onboarding.
  function renderOrgApp() {
    if (orgReady === null) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      );
    }
    if (!orgReady) {
      return <OrgOnboardScreen sessionToken={sessionToken} onDone={() => setOrgReady(true)} onLogOut={handleLogOut} />;
    }
    const { name, params } = stack[stack.length - 1];
    switch (name) {
      case 'orgShiftForm':
        return <OrgShiftFormScreen sessionToken={sessionToken} onBack={goBack} onDone={goBack} />;
      case 'orgRoster':
        return <OrgRosterScreen sessionToken={sessionToken} shiftId={params.shiftId} onBack={goBack} />;
      default:
        return <OrgHomeScreen sessionToken={sessionToken} navigate={navigate} onLogOut={handleLogOut} />;
    }
  }

  function renderApp() {
    if (!sessionToken) {
      return (
        <EmailCaptureScreen
          notice={signedOutNotice}
          onSignedUp={(token) => {
            setSignedOutNotice(null);
            setSessionToken(token);
          }}
        />
      );
    }
    if (accountKind === 'org') return renderOrgApp();
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
      {__DEV__ ? <Text style={styles.debugBar}>{backendStatus}</Text> : null}
      {sessionToken && profile && accountKind !== 'org' ? (
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
  signOutLink: {
    fontFamily: 'Inter_600SemiBold',
    color: '#B4543A',
    marginTop: 4,
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
