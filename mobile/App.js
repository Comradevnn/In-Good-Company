import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFonts, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { BACKEND_URL } from './config/api';
import { loadSessionToken } from './auth/session';
import EmailCaptureScreen from './screens/EmailCaptureScreen';
import QuickProfileScreen from './screens/QuickProfileScreen';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend...');
  // undefined = still reading secure storage; null = signed out; string = token
  const [sessionToken, setSessionToken] = useState(undefined);

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

  if (!fontsLoaded || sessionToken === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.debugBar}>{backendStatus}</Text>
      {sessionToken ? (
        <QuickProfileScreen sessionToken={sessionToken} />
      ) : (
        <EmailCaptureScreen onSignedUp={setSessionToken} />
      )}
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
});
