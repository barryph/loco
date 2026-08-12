import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/**
 * Tracks the user's current location while the map is mounted.
 *
 * Returns `null` until a fix is available (permission not granted, or the
 * first update has not arrived yet). The location keeps updating as the
 * device moves.
 */
export function useUserLocation(): Location.LocationObject | null {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    async function startWatching() {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || !active) {
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(
        () => null,
      );
      if (active && lastKnown) {
        setLocation(lastKnown);
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 1 },
        (next) => {
          if (active) {
            setLocation(next);
          }
        },
      ).catch(() => null);
    }

    startWatching();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return location;
}
