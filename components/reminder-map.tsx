import { Ionicons } from '@expo/vector-icons';
import Mapbox, {
  Camera,
  FillLayer,
  LineLayer,
  LocationPuck,
  MapView,
  PointAnnotation,
  ShapeSource,
} from '@rnmapbox/maps';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getMapboxToken } from '@/lib/mapbox';

try {
  Mapbox.setAccessToken(getMapboxToken());
} catch (e) {
  console.warn(e);
}

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
  style,
}: ReminderMapProps) {
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

  return (
    <View style={[styles.container, style]}>
      <MapView
        style={styles.map}
        onRegionIsChanging={showCenterPin ? handleRegionChange : undefined}
        logoEnabled
        attributionEnabled
      >
        <Camera
          ref={cameraRef}
          defaultSettings={
            initialCoordinate
              ? {
                  centerCoordinate: [initialCoordinate.longitude, initialCoordinate.latitude],
                  zoomLevel: initialZoom,
                }
              : undefined
          }
        />
        <LocationPuck puckBearingEnabled={false} />

        {radiusShape ? (
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

        {reminderPins.map((pin) => (
          <PointAnnotation key={pin.id} id={`reminder-${pin.id}`} coordinate={[pin.longitude, pin.latitude]}>
            <View style={styles.reminderPin}>
              <Ionicons name="location" size={34} color="#3b82f6" />
            </View>
          </PointAnnotation>
        ))}
      </MapView>

      {showCenterPin ? (
        <View style={styles.centerPin} pointerEvents="none">
          <Ionicons name="location" size={44} color="#ef4444" />
        </View>
      ) : null}
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
});
