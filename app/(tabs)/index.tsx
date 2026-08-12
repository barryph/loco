import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncGeofences } from '@/lib/geofencing';
import {
  getLocationPermissions,
  openAppSettings,
  requestBackgroundLocation,
  requestForegroundLocation,
  requestNotificationPermission,
  type LocationPermissions,
} from '@/lib/permissions';
import { deleteReminder, getReminders, subscribeReminders, type Reminder } from '@/lib/reminders';
import {
  formatRadius,
  GEOFENCE_RADIUS_PRESETS,
  getGeofenceRadius,
  setGeofenceRadius,
  subscribeGeofenceRadius,
} from '@/lib/settings';

export default function RemindersScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [radius, setRadius] = useState(1000);
  const [permissions, setPermissions] = useState<LocationPermissions>({
    foreground: 'undetermined',
    background: 'undetermined',
  });

  const refreshPermissions = useCallback(async () => {
    setPermissions(await getLocationPermissions());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPermissions();
    }, [refreshPermissions]),
  );

  React.useEffect(() => {
    getReminders().then(setReminders);
    getGeofenceRadius().then(setRadius);
    syncGeofences().catch((e) => console.warn('Failed to sync geofences:', e));

    const unsubscribeReminders = subscribeReminders(setReminders);
    const unsubscribeRadius = subscribeGeofenceRadius(setRadius);
    return () => {
      unsubscribeReminders();
      unsubscribeRadius();
    };
  }, []);

  const handleDelete = (reminder: Reminder) => {
    Alert.alert('Delete reminder?', reminder.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(reminder.id);
          await syncGeofences();
        },
      },
    ]);
  };

  const changeRadius = async (value: number) => {
    setRadius(value);
    await setGeofenceRadius(value);
    await syncGeofences();
  };

  const enableBackgroundLocation = async () => {
    let current = await getLocationPermissions();

    if (current.foreground !== 'granted') {
      const foreground = await requestForegroundLocation();
      current = { ...current, foreground };
    }

    if (current.foreground === 'granted' && current.background !== 'granted') {
      const explanation =
        Platform.OS === 'android'
          ? 'To notify you when you arrive near a reminder, Loco needs to access your location in the background. You will be taken to Settings to allow "Allow all the time" access.'
          : 'To notify you when you arrive near a reminder, Loco needs "Always" location access. The next prompt will ask you to choose "Allow While Using the App" or "Always".';
      Alert.alert('Background location', explanation, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            const background = await requestBackgroundLocation();
            setPermissions({ ...current, background });
            await requestNotificationPermission();
            refreshPermissions();
            syncGeofences().catch((e) => console.warn('Failed to sync geofences:', e));
          },
        },
      ]);
    } else {
      await requestNotificationPermission();
      refreshPermissions();
      syncGeofences().catch((e) => console.warn('Failed to sync geofences:', e));
    }
  };

  const renderRadiusChips = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusChips}>
      {GEOFENCE_RADIUS_PRESETS.map((preset) => {
        const selected = preset === radius;
        return (
          <Pressable
            key={preset}
            onPress={() => changeRadius(preset)}
            style={[
              styles.radiusChip,
              { borderColor: selected ? colors.tint : colors.icon },
              selected && { backgroundColor: colors.tint },
            ]}>
            <ThemedText
              style={[
                styles.radiusChipText,
                { color: selected ? invertedTextColor : colors.text },
              ]}>
              {formatRadius(preset)}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderPermissionBanner = () => {
    if (Platform.OS === 'web' || permissions.background === 'granted') {
      return null;
    }
    const denied = permissions.background === 'denied';
    return (
      <ThemedView style={[styles.banner, { borderColor: colors.icon }]}>
        <ThemedText type="defaultSemiBold">Background location is off</ThemedText>
        <ThemedText style={styles.bannerText}>
          {denied
            ? 'Loco needs background location to notify you when you arrive near a reminder. Enable it in Settings.'
            : 'Enable background location so Loco can remind you when you arrive near a saved place.'}
        </ThemedText>
        <Pressable
          onPress={denied ? openAppSettings : enableBackgroundLocation}
          style={[styles.bannerButton, { backgroundColor: colors.tint }]}>
          <ThemedText style={styles.bannerButtonText}>
            {denied ? 'Open Settings' : 'Enable background location'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  };

  const renderReminder = ({ item }: { item: Reminder }) => (
    <Pressable
      onPress={() => router.push({ pathname: '/new', params: { id: item.id } })}
      style={({ pressed }) => [styles.reminderRow, pressed && styles.rowPressed]}>
      <View style={styles.reminderInfo}>
        <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
        {item.description ? (
          <ThemedText numberOfLines={1} style={styles.reminderSubtitle}>
            {item.description}
          </ThemedText>
        ) : null}
        <ThemedText numberOfLines={1} style={styles.reminderSubtitle}>
          {item.placeName ?? `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`}
        </ThemedText>
      </View>
      <Pressable
        onPress={() => router.push({ pathname: '/new', params: { id: item.id } })}
        hitSlop={8}
        style={styles.rowAction}>
        <Ionicons name="create-outline" size={22} color={colors.icon} />
      </Pressable>
      <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={styles.rowAction}>
        <Ionicons name="trash-outline" size={22} color="#ef4444" />
      </Pressable>
    </Pressable>
  );

  const invertedTextColor = colorScheme === 'light' ? Colors['dark'].text : Colors['light'].text;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="title">Reminders</ThemedText>
        <View style={styles.headerRow}>
          <ThemedText style={{ color: colors.icon }}>
            {reminders.length === 0
              ? 'No reminders yet'
              : `${reminders.length} ${reminders.length === 1 ? 'reminder' : 'reminders'}`}
          </ThemedText>
          <Pressable
            onPress={() => router.push('/new')}
            hitSlop={8}
            style={[styles.addButton, { backgroundColor: colors.tint }]}>
            <Ionicons name="add" size={22} color={invertedTextColor} />
            <ThemedText style={[styles.addButtonText, { color: invertedTextColor }]}>Add</ThemedText>
          </Pressable>
        </View>
      </View>

      {renderPermissionBanner()}

      <View style={styles.radiusSection}>
        <ThemedText type="defaultSemiBold">Notification radius</ThemedText>
        <ThemedText style={[styles.radiusHint, { color: colors.icon }]}>
          The distance from a reminder at which you will be notified.
        </ThemedText>
        {renderRadiusChips()}
      </View>

      <FlatList
        data={reminders}
        keyExtractor={(item) => item.id}
        renderItem={renderReminder}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <ThemedView style={styles.emptyState}>
            <ThemedText style={{ textAlign: 'center' }}>
              Tap Add to create your first reminder — search for a place or drop a pin on the map.
            </ThemedText>
          </ThemedView>
        }
      />
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
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    fontWeight: '600',
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  bannerText: {
    fontSize: 14,
  },
  bannerButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  bannerButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  radiusSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 4,
  },
  radiusHint: {
    fontSize: 13,
  },
  radiusChips: {
    gap: 8,
    paddingVertical: 8,
  },
  radiusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  radiusChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  reminderInfo: {
    flex: 1,
    gap: 2,
  },
  reminderSubtitle: {
    fontSize: 13,
  },
  rowAction: {
    padding: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
});
