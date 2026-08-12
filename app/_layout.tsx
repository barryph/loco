import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncGeofences } from '@/lib/geofencing';
import { configureNotificationHandler } from '@/lib/notifications';

import '@/tasks/geofencing-task';

configureNotificationHandler();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  React.useEffect(() => {
    syncGeofences().catch((e) => console.warn('Failed to sync geofences:', e));
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="new" options={{ title: 'New reminder', presentation: 'card' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
