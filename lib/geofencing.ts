import { Platform } from 'react-native';
import * as Location from 'expo-location';

import { getReminders } from './reminders';

export const GEOFENCING_TASK = 'loco-geofencing';

export async function syncGeofences(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const reminders = await getReminders();

  if (reminders.length === 0) {
    await Location.stopGeofencingAsync(GEOFENCING_TASK).catch(() => {
      // Nothing was registered; nothing to stop.
    });
    return;
  }

  const regions: Location.LocationRegion[] = reminders.map((reminder) => ({
    identifier: reminder.id,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
    radius: reminder.radius,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  await Location.startGeofencingAsync(GEOFENCING_TASK, regions);
}

export async function stopGeofences(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await Location.stopGeofencingAsync(GEOFENCING_TASK).catch(() => {
    // Nothing was registered; nothing to stop.
  });
}
