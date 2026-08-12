import { Ionicons } from '@expo/vector-icons';
import Mapbox, {
  Camera,
  FillLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
} from '@rnmapbox/maps';
import * as Location from 'expo-location';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUserLocation } from '@/hooks/use-user-location';
import { getMapboxToken } from '@/lib/mapbox';
import { requestForegroundLocation } from '@/lib/permissions';

try {
  Mapbox.setAccessToken(getMapboxToken());
} catch (e) {
  console.warn(e);
}

const isNative = Platform.OS !== 'web';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type RadiusCircle = Coordinate & { id: string; radius: number };

export type ReminderMapProps = {
  cameraRef?: React.RefObject<React.ElementRef<typeof Camera> | null>;
  initialCoordinate?: Coordinate;
  initialZoom?: number;
  showCenterPin?: boolean;
  selectedCoordinate?: Coordinate | null;
  radiusCircles?: RadiusCircle[];
  reminderPins?: (Coordinate & { id: string })[];
  onCenterChange?: (coordinate: Coordinate) => void;
  recenterButtonTop?: number;
  style?: View['props']['style'];
};

function circlePolygon(
  longitude: number,
  latitude: number,
  radiusMeters: number,
  segments = 64,
): [number, number][] {
  const metersPerDegLat = 111320;
  const latRad = (latitude * Math.PI) / 180;
  const metersPerDegLng = 111320 * Math.cos(latRad);
  const dLat = radiusMeters / metersPerDegLat;
  const dLng = radiusMeters / metersPerDegLng;

  const coordinates: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    coordinates.push([
      longitude + dLng * Math.cos(theta),
      latitude + dLat * Math.sin(theta),
    ]);
  }
  return coordinates;
}

export function ReminderMap({
  cameraRef,
  initialCoordinate,
  initialZoom = 14,
  showCenterPin = false,
  selectedCoordinate,
  radiusCircles = [],
  reminderPins = [],
  onCenterChange,
  recenterButtonTop = 12,
  style,
}: ReminderMapProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const internalCameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const resolvedCameraRef = cameraRef ?? internalCameraRef;
  const [recentering, setRecentering] = useState(false);
  const userLocation = useUserLocation();

  const radiusShape =
    radiusCircles.length > 0
      ? {
        type: 'FeatureCollection',
        features: radiusCircles.map((circle) => ({
          type: 'Feature',
          properties: { id: circle.id },
          geometry: {
            type: 'Polygon',
            coordinates: [circlePolygon(circle.longitude, circle.latitude, circle.radius)],
          },
        })),
      }
      : null;

  const handleRegionChange = (event: GeoJSON.Feature<GeoJSON.Point>) => {
    const center = event.geometry?.coordinates;
    if (center && Array.isArray(center) && center.length === 2) {
      onCenterChange?.({ longitude: center[0], latitude: center[1] });
    }
  };

  const handleRecenter = async () => {
    setRecentering(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        await requestForegroundLocation();
      }
      const position =
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
          () => null,
        )) ??
        (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null));
      if (position) {
        resolvedCameraRef.current?.flyTo([
          position.coords.longitude,
          position.coords.latitude,
        ], 1000);
      }
    } catch (e) {
      console.warn('Failed to recenter map:', e);
    } finally {
      setRecentering(false);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        style={styles.map}
        onRegionIsChanging={showCenterPin ? handleRegionChange : undefined}
        logoEnabled
        attributionEnabled
      >
        <Camera
          ref={resolvedCameraRef}
          defaultSettings={
            initialCoordinate
              ? {
                centerCoordinate: [initialCoordinate.longitude, initialCoordinate.latitude],
                zoomLevel: initialZoom,
              }
              : undefined
          }
        />
        {isNative && userLocation ? (
          <PointAnnotation
            id="loco-user-location"
            coordinate={[userLocation.coords.longitude, userLocation.coords.latitude]}
          >
            <View style={styles.userLocationMarker}>
              <View style={styles.userLocationHalo} />
              <View style={styles.userLocationDot} />
            </View>
          </PointAnnotation>
        ) : null}

        {isNative && radiusShape ? (
          <ShapeSource id="loco-radius-circles" shape={radiusShape as GeoJSON.FeatureCollection}>
            <FillLayer
              id="loco-radius-fill"
              style={{ fillColor: 'rgba(14, 165, 233, 0.15)', fillOutlineColor: '#0ea5e9' }}
            />
            <LineLayer
              id="loco-radius-outline"
              style={{ lineColor: '#0ea5e9', lineWidth: 2 }}
            />
          </ShapeSource>
        ) : null}

        {isNative
          ? reminderPins.map((pin) => (
            <PointAnnotation key={pin.id} id={`reminder-${pin.id}`} coordinate={[pin.longitude, pin.latitude]}>
              <View style={styles.reminderPin}>
                <Ionicons name="location" size={34} color="#3b82f6" />
              </View>
            </PointAnnotation>
          ))
          : null}
      </MapView>

      {showCenterPin ? (
        <View style={styles.centerPin} pointerEvents="none">
          <Ionicons name="location" size={44} color="#ef4444" />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter map on your current location"
        hitSlop={8}
        onPress={handleRecenter}
        style={({ pressed }) => [
          styles.recenterButton,
          { backgroundColor: colors.background, top: recenterButtonTop },
          pressed && styles.recenterButtonPressed,
        ]}
      >
        {recentering ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Ionicons name="locate" size={22} color={colors.text} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  centerPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -44,
  },
  reminderPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationMarker: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationHalo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3b82f6',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  recenterButton: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenterButtonPressed: {
    opacity: 0.7,
  },
});
