import { Ionicons } from '@expo/vector-icons';
import { Camera } from '@rnmapbox/maps';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReminderMap } from '@/components/reminder-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncGeofences } from '@/lib/geofencing';
import { reverseGeocode, searchPlaces, type MapboxPlace } from '@/lib/mapbox';
import { createReminder, getReminder, getReminders, updateReminder, type Reminder } from '@/lib/reminders';
import { getGeofenceRadius } from '@/lib/settings';

type Coordinate = { latitude: number; longitude: number };

type SelectedPlace = {
  name: string;
  address: string | null;
  placeId: string | null;
  latitude: number;
  longitude: number;
};

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function NewReminderScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === 'string' && params.id.length > 0 ? params.id : null;

  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);

  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapboxPlace[]>([]);
  const [searching, setSearching] = useState(false);

  const [otherReminders, setOtherReminders] = useState<Reminder[]>([]);
  const [geofenceRadius, setGeofenceRadius] = useState(1000);

  const userLocationRef = useRef<Coordinate | null>(null);
  const suppressPinSyncRef = useRef(false);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeRef = useRef<SelectedPlace | null>(null);
  placeRef.current = place;

  const mountedInEditMode = useRef(editingId !== null).current;

  const flyToCoord = useCallback((coord: Coordinate) => {
    cameraRef.current?.flyTo([coord.longitude, coord.latitude], 1500);
    suppressPinSyncRef.current = true;
    setTimeout(() => {
      suppressPinSyncRef.current = false;
    }, 2500);
  }, []);

  useEffect(() => {
    if (mountedInEditMode) {
      return;
    }
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          return;
        }
        const position =
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
            () => null,
          )) ??
          (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null));
        if (position) {
          const coord = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          userLocationRef.current = coord;
          setCoordinate(coord);
          flyToCoord(coord);
        }
      } catch (e) {
        console.warn('Failed to get user location:', e);
      }
    })();
  }, [flyToCoord, mountedInEditMode]);

  useEffect(() => {
    getReminders().then(setOtherReminders);
    getGeofenceRadius().then(setGeofenceRadius);
  }, []);

  useEffect(() => {
    setCoordinate(null);
    setPlace(null);
    setName('');
    setNameEdited(false);
    setSearchQuery('');
    setSearchResults([]);

    if (editingId) {
      getReminder(editingId).then((reminder) => {
        if (!reminder) {
          return;
        }
        const coord = { latitude: reminder.latitude, longitude: reminder.longitude };
        setCoordinate(coord);
        setPlace({
          name: reminder.name,
          address: reminder.placeName ?? null,
          placeId: reminder.placeId ?? null,
          latitude: reminder.latitude,
          longitude: reminder.longitude,
        });
        setName(reminder.name);
        flyToCoord(coord);
      });
    } else if (userLocationRef.current) {
      setCoordinate(userLocationRef.current);
      flyToCoord(userLocationRef.current);
    }
  }, [editingId, flyToCoord]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed, {
          proximity: userLocationRef.current ?? undefined,
        });
        setSearchResults(results);
      } catch (e) {
        console.warn('Search failed:', e);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const scheduleReverseGeocode = useCallback((coord: Coordinate) => {
    if (reverseTimerRef.current) {
      clearTimeout(reverseTimerRef.current);
    }
    reverseTimerRef.current = setTimeout(async () => {
      try {
        const result = await reverseGeocode(coord.latitude, coord.longitude);
        if (result) {
          setPlace(result);
          if (!nameEdited) {
            setName(result.name);
          }
        }
      } catch {
        // Ignore reverse geocode failures; coordinates are always valid.
      }
    }, 700);
  }, [nameEdited]);

  useEffect(() => {
    return () => {
      if (reverseTimerRef.current) {
        clearTimeout(reverseTimerRef.current);
      }
    };
  }, []);

  const handleCenterChange = (coord: Coordinate) => {
    setCoordinate(coord);
    if (suppressPinSyncRef.current) {
      return;
    }
    const currentPlace = placeRef.current;
    if (currentPlace && distanceMeters(currentPlace, coord) > 30) {
      setPlace(null);
      scheduleReverseGeocode(coord);
    }
  };

  const selectResult = (result: MapboxPlace) => {
    const coord = { latitude: result.latitude, longitude: result.longitude };
    setCoordinate(coord);
    setPlace(result);
    if (!nameEdited) {
      setName(result.name);
    }
    setSearchQuery(result.name);
    setSearchResults([]);
    Keyboard.dismiss();
    flyToCoord(coord);
  };

  const handleSave = async () => {
    if (!coordinate) {
      Alert.alert('Choose a location', 'Search for a place or move the map to drop a pin.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim() || place?.name || 'Reminder',
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        placeId: place?.placeId ?? null,
        placeName: place?.address ?? place?.name ?? null,
      };
      if (editingId) {
        await updateReminder(editingId, data);
      } else {
        await createReminder(data);
      }
      await syncGeofences();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (e) {
      console.warn('Failed to save reminder:', e);
      Alert.alert('Something went wrong', 'The reminder could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const locationSummary = place
    ? place.name
    : coordinate
      ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
      : 'Search for a place or move the map';

  const radiusCircles = otherReminders.map((reminder) => ({
    id: reminder.id,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
    radius: geofenceRadius,
  }));
  const reminderPins = otherReminders.map((reminder) => ({
    id: reminder.id,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: editingId ? 'Edit reminder' : 'New reminder' }} />
      <ReminderMap
        cameraRef={cameraRef}
        showCenterPin
        selectedCoordinate={coordinate}
        onCenterChange={handleCenterChange}
        radiusCircles={radiusCircles}
        reminderPins={reminderPins}
        recenterButtonTop={60}
      />

      <View style={styles.searchOverlay}>
        <View style={[styles.searchBar, { backgroundColor: colors.background }]}>
          <Ionicons name="search" size={18} color={colors.icon} />
          <TextInput
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setNameEdited(true);
            }}
            placeholder="Search for a place"
            placeholderTextColor={colors.icon}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.icon} />
          ) : searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.icon} />
            </Pressable>
          ) : null}
        </View>

        {searchResults.length > 0 ? (
          <ThemedView style={styles.searchResults}>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.placeId}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onPress={() => selectResult(item)} style={styles.searchResult}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                  {item.address ? (
                    <ThemedText numberOfLines={1} style={[styles.searchResultAddress, { color: colors.icon }]}>
                      {item.address}
                    </ThemedText>
                  ) : null}
                </Pressable>
              )}
            />
          </ThemedView>
        ) : null}
      </View>

      <ThemedView style={[styles.bottomPanel, { borderTopColor: colors.icon }]}>
        <View style={styles.locationRow}>
          <Ionicons name="location" size={18} color={colors.tint} />
          <ThemedText numberOfLines={1} style={styles.locationText}>
            {locationSummary}
          </ThemedText>
        </View>
        <View style={styles.nameRow}>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              setNameEdited(true);
            }}
            placeholder={editingId ? 'Reminder name' : 'What do you want to remember here?'}
            placeholderTextColor={colors.icon}
            style={[styles.nameInput, { color: colors.text, backgroundColor: colors.background }]}
          />
          <Pressable
            onPress={handleSave}
            disabled={!coordinate || saving}
            style={[
              styles.saveButton,
              { backgroundColor: colors.tint },
              (!coordinate || saving) && styles.saveButtonDisabled,
            ]}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>
                {editingId ? 'Save' : 'Create reminder'}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchOverlay: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 10,
    gap: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00000033',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  searchResults: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    maxHeight: 260,
  },
  searchResult: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000022',
  },
  searchResultAddress: {
    fontSize: 13,
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00000033',
  },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
