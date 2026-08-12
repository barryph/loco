import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { Reminder } from './reminders';

const CHANNEL_ID = 'reminders';

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const existing = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
  if (!existing) {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Location reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleArrivalNotification(reminder: Reminder): Promise<void> {
  await ensureChannel();
  const body =
    reminder.placeName && reminder.placeName !== reminder.name
      ? `You're near ${reminder.placeName}.`
      : 'You have a reminder here.';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.name,
      body,
      data: { reminderId: reminder.id },
    },
    trigger: null,
  });
}
