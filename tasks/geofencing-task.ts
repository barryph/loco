import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { GEOFENCING_TASK } from '@/lib/geofencing';
import { scheduleArrivalNotification } from '@/lib/notifications';
import { getReminder } from '@/lib/reminders';

const COOLDOWN_MS = 10 * 60 * 1000;

function lastTriggeredKey(id: string): string {
  return `loco.lastTriggered.${id}`;
}

async function shouldNotify(reminderId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(lastTriggeredKey(reminderId));
  if (!raw) {
    return true;
  }
  const last = Number(raw);
  if (!Number.isFinite(last)) {
    return true;
  }
  return Date.now() - last >= COOLDOWN_MS;
}

async function recordTrigger(reminderId: string): Promise<void> {
  await AsyncStorage.setItem(lastTriggeredKey(reminderId), String(Date.now()));
}

TaskManager.defineTask(GEOFENCING_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Loco geofencing task error:', error.message);
    return;
  }
  if (!data) {
    return;
  }

  const { eventType, region } = data as {
    eventType?: Location.GeofencingEventType;
    region?: { identifier?: string };
  };

  if (eventType !== Location.GeofencingEventType.Enter || !region?.identifier) {
    return;
  }

  const reminder = await getReminder(region.identifier);
  if (!reminder) {
    return;
  }

  if (!(await shouldNotify(reminder.id))) {
    return;
  }

  await scheduleArrivalNotification(reminder);
  await recordTrigger(reminder.id);
});
