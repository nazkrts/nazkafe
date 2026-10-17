import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { api, loadTokens, refreshTokenValue, setLogoutHandler, setTokens } from './src/api';
import { c } from './src/theme';
import Login from './src/screens/Login';
import Cafes from './src/screens/Cafes';
import Scan from './src/screens/Scan';
import Discover from './src/screens/Discover';
import Matches from './src/screens/Matches';
import Chat from './src/screens/Chat';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: c.green,
        tabBarInactiveTintColor: '#6B7B77',
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: c.ink, fontWeight: '700' },
        headerRight: () => (
          <Pressable accessibilityRole="button" onPress={onLogout} style={{ padding: 12 }}>
            <Text style={{ color: c.green, fontWeight: '500' }}>Çıkış</Text>
          </Pressable>
        ),
      }}
    >
      <Tab.Screen name="Kafeler" component={Cafes} options={{ tabBarIcon: () => null, tabBarLabelStyle: { fontSize: 14, marginBottom: 12 } }} />
      <Tab.Screen name="Keşif" component={Discover} options={{ tabBarIcon: () => null, tabBarLabelStyle: { fontSize: 14, marginBottom: 12 } }} />
      <Tab.Screen name="Eşleşmeler" component={Matches} options={{ tabBarIcon: () => null, tabBarLabelStyle: { fontSize: 14, marginBottom: 12 } }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setLogoutHandler(() => setAuthed(false));
    loadTokens().then((has) => {
      setAuthed(has);
      setReady(true);
    });
  }, []);

  const logout = async () => {
    try {
      const rt = refreshTokenValue();
      if (rt) await api('POST', '/auth/logout', { refresh_token: rt });
    } catch {
      /* oturum zaten kapanmış olabilir */
    }
    await setTokens(null);
    setAuthed(false);
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.green} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {authed ? (
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.green }}>
            <Stack.Screen name="Tabs" options={{ headerShown: false }}>
              {() => <Tabs onLogout={logout} />}
            </Stack.Screen>
            <Stack.Screen name="Scan" component={Scan} options={{ title: 'QR tara', presentation: 'modal' }} />
            <Stack.Screen name="Chat" component={Chat} options={{ title: 'Sohbet' }} />
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        <Login onDone={() => setAuthed(true)} />
      )}
    </SafeAreaProvider>
  );
}
