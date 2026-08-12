import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_GEOFENCE_RADIUS } from './settings';

export type Reminder = {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  placeId?: string | null;
  placeName?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ReminderInput = {
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  placeId?: string | null;
  placeName?: string | null;
};

const STORAGE_KEY = 'loco.reminders';

type Listener = (reminders: Reminder[]) => void;

const listeners = new Set<Listener>();

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getReminders(): Promise<Reminder[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as Reminder[]).map((reminder) => ({
      ...reminder,
      radius:
        Number.isFinite(reminder.radius) && reminder.radius > 0
          ? reminder.radius
          : DEFAULT_GEOFENCE_RADIUS,
    }));
  } catch {
    return [];
  }
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const reminders = await getReminders();
  return reminders.find((r) => r.id === id) ?? null;
}

async function persist(reminders: Reminder[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  listeners.forEach((listener) => listener(reminders));
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const now = Date.now();
  const reminder: Reminder = {
    id: generateId(),
    ...input,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const reminders = await getReminders();
  await persist([...reminders, reminder]);
  return reminder;
}

export async function updateReminder(
  id: string,
  patch: Partial<ReminderInput>,
): Promise<Reminder | null> {
  const reminders = await getReminders();
  const index = reminders.findIndex((r) => r.id === id);
  if (index === -1) {
    return null;
  }
  const updated: Reminder = {
    ...reminders[index],
    ...patch,
    id,
    updatedAt: Date.now(),
  };
  reminders[index] = updated;
  await persist(reminders);
  return updated;
}

export async function deleteReminder(id: string): Promise<void> {
  const reminders = await getReminders();
  await persist(reminders.filter((r) => r.id !== id));
}

export function subscribeReminders(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
