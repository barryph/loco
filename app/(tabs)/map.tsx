import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReminderMap } from '@/components/reminder-map';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getReminders, subscribeReminders, type Reminder } from '@/lib/reminders';

type Coordinate = { latitude: number; longitude: number };

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [initialCoordinate, setInitialCoordinate] = useState<Coordinate | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          return;
        }
        const position =
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
            () => null,
          )) ??
          (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null));
        if (position) {
          setInitialCoordinate({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      } catch (e) {
        console.warn('Failed to get user location:', e);
      } finally {
        setMapReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    getReminders().then(setReminders);
    const unsubscribeReminders = subscribeReminders(setReminders);
    return () => {
      unsubscribeReminders();
    };
  }, []);

  const radiusCircles = reminders.map((reminder) => ({
    id: reminder.id,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
    radius: reminder.radius,
  }));
  const reminderPins = reminders.map((reminder) => ({
    id: reminder.id,
    name: reminder.name,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="title">Map</ThemedText>
      </View>
      {mapReady ? (
        <ReminderMap
          initialCoordinate={initialCoordinate ?? undefined}
          radiusCircles={radiusCircles}
          reminderPins={reminderPins}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
