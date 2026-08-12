import { Linking } from 'react-native';
import * as Location from 'expo-location';

import { ensureNotificationPermissions } from './notifications';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type LocationPermissions = {
  foreground: LocationPermissionStatus;
  background: LocationPermissionStatus;
};

async function toStatus(
  response: Location.LocationPermissionResponse,
): Promise<LocationPermissionStatus> {
  const status = await response.status;
  if (status === 'granted') {
    return 'granted';
  }
  if (status === 'undetermined') {
    return 'undetermined';
  }
  return 'denied';
}

export async function getLocationPermissions(): Promise<LocationPermissions> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return {
    foreground: await toStatus(foreground),
    background: await toStatus(background),
  };
}

export async function requestForegroundLocation(): Promise<LocationPermissionStatus> {
  const response = await Location.requestForegroundPermissionsAsync();
  return toStatus(response);
}

/**
 * Requests "Always" background access. On Android 11+ this opens the system
 * settings page; the caller should explain why it's needed beforehand.
 */
export async function requestBackgroundLocation(): Promise<LocationPermissionStatus> {
  const response = await Location.requestBackgroundPermissionsAsync();
  return toStatus(response);
}

export async function requestNotificationPermission(): Promise<boolean> {
  return ensureNotificationPermissions();
}

export function openAppSettings(): void {
  Linking.openSettings().catch(() => {
    // Ignore; some platforms do not have a settings deep link.
  });
}
