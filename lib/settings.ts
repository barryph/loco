export const DEFAULT_GEOFENCE_RADIUS = 1000;

export const GEOFENCE_RADIUS_PRESETS = [100, 250, 500, 1000, 2000, 5000];

export function formatRadius(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)}km`;
}
