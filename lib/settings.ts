import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_GEOFENCE_RADIUS = 1000;

export const GEOFENCE_RADIUS_PRESETS = [100, 250, 500, 1000, 2000, 5000];

const RADIUS_KEY = 'loco.settings.geofenceRadius';

type Listener = (radius: number) => void;

const listeners = new Set<Listener>();

export async function getGeofenceRadius(): Promise<number> {
  const raw = await AsyncStorage.getItem(RADIUS_KEY);
  if (!raw) {
    return DEFAULT_GEOFENCE_RADIUS;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GEOFENCE_RADIUS;
}

export async function setGeofenceRadius(radius: number): Promise<void> {
  await AsyncStorage.setItem(RADIUS_KEY, String(radius));
  listeners.forEach((listener) => listener(radius));
}

export function subscribeGeofenceRadius(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatRadius(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)}km`;
}
