import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { Camera, MapView } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import { ReminderMap } from '@/components/reminder-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUserLocation } from '@/hooks/use-user-location';
import { syncGeofences } from '@/lib/geofencing';
import { reverseGeocode, searchPlaces, type MapboxPlace } from '@/lib/mapbox';
import {
  createReminder,
  deleteReminder,
  getReminders,
  subscribeReminders,
  updateReminder,
  type Reminder,
} from '@/lib/reminders';
import {
  DEFAULT_GEOFENCE_RADIUS,
  distanceMeters,
  formatDistance,
  formatRadius,
  GEOFENCE_RADIUS_PRESETS,
} from '@/lib/settings';

type Coordinate = { latitude: number; longitude: number };

type SelectedPlace = {
  name: string;
  address: string | null;
  placeId: string | null;
  latitude: number;
  longitude: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { height: windowHeight } = useWindowDimensions();

  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const mapViewRef = useRef<React.ElementRef<typeof MapView>>(null);
  const sheetRef = useRef<BottomSheet>(null);

  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [initialCoordinate, setInitialCoordinate] = useState<Coordinate | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [manualPinMode, setManualPinMode] = useState(false);
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [radius, setRadius] = useState(DEFAULT_GEOFENCE_RADIUS);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapboxPlace[]>([]);
  const [searching, setSearching] = useState(false);

  const userLocation = useUserLocation();
  const userLocationRef = useRef<Coordinate | null>(null);
  const suppressPinSyncRef = useRef(false);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeRef = useRef<SelectedPlace | null>(null);

  const sheetPosition = useSharedValue(windowHeight * 0.6);
  const modeShared = useSharedValue<'list' | 'create'>('list');
  const windowHeightShared = useSharedValue(windowHeight);

  useEffect(() => {
    modeShared.value = mode;
  }, [mode, modeShared]);

  useEffect(() => {
    windowHeightShared.value = windowHeight;
  }, [windowHeight, windowHeightShared]);

  useEffect(() => {
    placeRef.current = place;
  }, [place]);

  useEffect(() => {
    if (userLocation) {
      userLocationRef.current = {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
      };
    }
  }, [userLocation]);

  const snapPoints = useMemo(() => ['25%', '45%', '85%'], []);

  useEffect(() => {
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
          setInitialCoordinate(coord);
        }
      } catch (e) {
        console.warn('Failed to get user location:', e);
      } finally {
        setMapReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    getReminders().then(setReminders);
    const unsubscribeReminders = subscribeReminders(setReminders);
    return () => {
      unsubscribeReminders();
    };
  }, []);

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

  useEffect(() => {
    if (mode !== 'create') {
      return;
    }
    if (searching || searchResults.length > 0) {
      sheetRef.current?.close();
    } else {
      sheetRef.current?.snapToIndex(1);
    }
  }, [mode, searching, searchResults]);

  useEffect(() => {
    return () => {
      if (reverseTimerRef.current) {
        clearTimeout(reverseTimerRef.current);
      }
    };
  }, []);

  const flyToCoord = useCallback((coord: Coordinate) => {
    cameraRef.current?.flyTo([coord.longitude, coord.latitude], 600);
    suppressPinSyncRef.current = true;
    setTimeout(() => {
      suppressPinSyncRef.current = false;
    }, 2500);
  }, []);

  const scheduleReverseGeocode = useCallback(
    (coord: Coordinate) => {
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
    },
    [nameEdited],
  );

  const handleCenterChange = useCallback(
    (coord: Coordinate) => {
      setCoordinate(coord);
      if (suppressPinSyncRef.current) {
        return;
      }
      const currentPlace = placeRef.current;
      if (currentPlace && distanceMeters(currentPlace, coord) > 30) {
        setPlace(null);
        scheduleReverseGeocode(coord);
      }
    },
    [scheduleReverseGeocode],
  );

  const toggleManualPinMode = useCallback(async () => {
    if (manualPinMode) {
      setManualPinMode(false);
      return;
    }
    setManualPinMode(true);
    const center = await mapViewRef.current?.getCenter().catch(() => null);
    if (center) {
      handleCenterChange({ latitude: center[1], longitude: center[0] });
    }
  }, [manualPinMode, handleCenterChange]);

  const selectResult = useCallback(
    (result: MapboxPlace) => {
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
    },
    [nameEdited, flyToCoord],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setCoordinate(null);
    setManualPinMode(false);
    setPlace(null);
    setName('');
    setNameEdited(false);
    setDescription('');
    setSearchQuery('');
    setSearchResults([]);
    setRadius(DEFAULT_GEOFENCE_RADIUS);
  }, []);

  const closeForm = useCallback(() => {
    Keyboard.dismiss();
    setMode('list');
    resetForm();
    sheetRef.current?.snapToIndex(1);
  }, [resetForm]);

  const openCreate = useCallback(async () => {
    Keyboard.dismiss();
    resetForm();
    setMode('create');
    sheetRef.current?.snapToIndex(1);
    const center = await mapViewRef.current?.getCenter().catch(() => null);
    if (center) {
      setCoordinate({ latitude: center[1], longitude: center[0] });
    } else if (userLocationRef.current) {
      setCoordinate(userLocationRef.current);
    }
  }, [resetForm]);

  const openEdit = useCallback(
    (reminder: Reminder) => {
      Keyboard.dismiss();
      resetForm();
      const coord = { latitude: reminder.latitude, longitude: reminder.longitude };
      setEditingId(reminder.id);
      setMode('create');
      sheetRef.current?.snapToIndex(1);
      setCoordinate(coord);
      setPlace({
        name: reminder.name,
        address: reminder.placeName ?? null,
        placeId: reminder.placeId ?? null,
        latitude: reminder.latitude,
        longitude: reminder.longitude,
      });
      setName(reminder.name);
      setNameEdited(true);
      setDescription(reminder.description ?? '');
      setRadius(reminder.radius);
      flyToCoord(coord);
    },
    [resetForm, flyToCoord],
  );

  const handleSave = useCallback(async () => {
    if (!coordinate) {
      Alert.alert('Choose a location', 'Search for a place or move the map to drop a pin.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim() || place?.name || 'Reminder',
        description: description.trim() || null,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        radius,
        placeId: place?.placeId ?? null,
        placeName: place?.address ?? place?.name ?? null,
      };
      if (editingId) {
        await updateReminder(editingId, data);
      } else {
        await createReminder(data);
      }
      await syncGeofences();
      closeForm();
    } catch (e) {
      console.warn('Failed to save reminder:', e);
      Alert.alert('Something went wrong', 'The reminder could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [coordinate, name, description, radius, place, editingId, closeForm]);

  const handleDelete = useCallback((reminder: Reminder) => {
    Alert.alert('Delete reminder?', reminder.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(reminder.id);
          await syncGeofences();
        },
      },
    ]);
  }, []);

  const handleRowPress = useCallback((reminder: Reminder) => {
    cameraRef.current?.flyTo([reminder.longitude, reminder.latitude], 600);
    sheetRef.current?.collapse();
  }, []);

  const formPaneStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withTiming(modeShared.value === 'create' ? 0 : windowHeightShared.value, {
          duration: 250,
        }),
      },
    ],
  }));

  const searchOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(modeShared.value === 'create' ? 0 : -160, { duration: 250 }) }],
    opacity: withTiming(modeShared.value === 'create' ? 1 : 0, { duration: 200 }),
  }));

  const fabStyle = useAnimatedStyle(() => ({
    bottom: windowHeightShared.value - sheetPosition.value + 16,
  }));

  const userCoordinate = userLocation
    ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
    : null;

  const radiusCircles = reminders.map((reminder) => ({
    id: reminder.id,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
    radius: reminder.radius,
  }));
  const reminderPins = reminders.map((reminder) => ({
    id: reminder.id,
    name: reminder.name,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
  }));

  const locationSummary = manualPinMode
    ? coordinate
      ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
      : 'Move the map to choose a location'
    : place
      ? place.name
      : coordinate
        ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
        : 'Search for a place or move the map';

  const invertedTextColor = colorScheme === 'light' ? Colors['dark'].text : Colors['light'].text;

  const renderReminder = ({ item }: { item: Reminder }) => {
    const distance = userCoordinate ? distanceMeters(userCoordinate, item) : null;
    return (
      <Pressable
        onPress={() => handleRowPress(item)}
        style={({ pressed }) => [styles.reminderRow, pressed && styles.rowPressed]}>
        <View style={styles.reminderInfo}>
          <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
          <ThemedText numberOfLines={1} style={styles.reminderSubtitle}>
            {item.placeName ?? `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`}
          </ThemedText>
          {distance !== null ? (
            <ThemedText numberOfLines={1} style={[styles.reminderSubtitle, { color: colors.icon }]}>
              {formatDistance(distance)} away
            </ThemedText>
          ) : null}
        </View>
        <Pressable onPress={() => openEdit(item)} hitSlop={8} style={styles.rowAction}>
          <Ionicons name="create-outline" size={22} color={colors.icon} />
        </Pressable>
        <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={styles.rowAction}>
          <Ionicons name="trash-outline" size={22} color="#ef4444" />
        </Pressable>
        <Pressable hitSlop={8} style={styles.rowAction} accessibilityLabel="Open reminder details">
          <Ionicons name="chevron-forward" size={22} color={colors.icon} />
        </Pressable>
      </Pressable>
    );
  };

  const renderRadiusChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.radiusChips}>
      {GEOFENCE_RADIUS_PRESETS.map((preset) => {
        const selected = preset === radius;
        return (
          <Pressable
            key={preset}
            onPress={() => setRadius(preset)}
            style={[
              styles.radiusChip,
              { borderColor: selected ? colors.tint : colors.icon },
              selected && { backgroundColor: colors.tint },
            ]}>
            <ThemedText
              style={[
                styles.radiusChipText,
                { color: selected ? invertedTextColor : colors.text },
              ]}>
              {formatRadius(preset)}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLogo}>
          <FontAwesome6 name="map-location" size={22} color="black" />
          <ThemedText type="title">Loco</ThemedText>
        </View>
        <Pressable
          onPress={() => router.push('/reminders')}
          hitSlop={8}
          accessibilityLabel="View all reminders"
          style={styles.headerButton}>
          <Ionicons name="list-outline" size={24} color={colors.tint} />
        </Pressable>
      </View>

      <View style={styles.mapWrapper}>
        {mapReady ? (
          <ReminderMap
            cameraRef={cameraRef}
            mapViewRef={mapViewRef}
            initialCoordinate={initialCoordinate ?? undefined}
            showCenterPin={mode === 'create' && manualPinMode}
            onCenterChange={mode === 'create' ? handleCenterChange : undefined}
            radiusCircles={radiusCircles}
            reminderPins={reminderPins}
            recenterButtonTop={mode === 'create' ? 60 : 12}
          />
        ) : null}

        <Animated.View
          style={[styles.searchOverlay, searchOverlayStyle]}
          pointerEvents={mode === 'create' ? 'auto' : 'none'}>
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
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  sheetRef.current?.snapToIndex(2);
                }}
                hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.icon} />
              </Pressable>
            ) : null}
          </View>
          {searchResults.length > 0 ? (
            <ThemedView style={styles.searchResults}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {searchResults.map((result) => (
                  <Pressable
                    key={result.placeId}
                    onPress={() => selectResult(result)}
                    style={styles.searchResult}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1}>
                      {result.name}
                    </ThemedText>
                    {result.address ? (
                      <ThemedText
                        numberOfLines={1}
                        style={[styles.searchResultAddress, { color: colors.icon }]}>
                        {result.address}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </ThemedView>
          ) : null}
        </Animated.View>

        {mode === 'create' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={manualPinMode ? 'Disable manual pin mode' : 'Enable manual pin mode'}
            accessibilityState={{ selected: manualPinMode }}
            hitSlop={8}
            onPress={toggleManualPinMode}
            style={({ pressed }) => [
              styles.manualPinButton,
              manualPinMode ? styles.manualPinButtonActive : { backgroundColor: colors.background },
              pressed && styles.recenterButtonPressed,
            ]}>
            <Ionicons
              name={manualPinMode ? 'location' : 'location-outline'}
              size={22}
              color={manualPinMode ? '#fff' : colors.text}
            />
          </Pressable>
        ) : null}
      </View>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        animatedPosition={sheetPosition}
        keyboardBehavior="interactive"
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.icon }}>
        <View style={styles.sheetBody}>
          <View style={styles.listPane}>
            <View style={styles.sheetHeader}>
              <ThemedText type="defaultSemiBold">Active reminders</ThemedText>
              <ThemedText style={{ color: colors.icon }}>
                {reminders.length === 0
                  ? 'None yet'
                  : `${reminders.length} ${reminders.length === 1 ? 'reminder' : 'reminders'}`}
              </ThemedText>
            </View>
            <BottomSheetFlatList
              data={reminders}
              keyExtractor={(item) => item.id}
              renderItem={renderReminder}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <ThemedText style={{ textAlign: 'center', color: colors.icon }}>
                    Tap “Add reminder” to create your first reminder.
                  </ThemedText>
                </View>
              }
            />
          </View>

          <Animated.View style={[styles.formPane, { backgroundColor: colors.background }, formPaneStyle]}>
            <BottomSheetScrollView
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.formHeader}>
                <Pressable onPress={closeForm} hitSlop={8} style={styles.formBackButton}>
                  <Ionicons name="chevron-back" size={26} color={colors.tint} />
                </Pressable>
                <ThemedText type="defaultSemiBold" style={styles.formTitle}>
                  {editingId ? 'Edit reminder' : 'New reminder'}
                </ThemedText>
              </View>
              <View style={styles.locationRow}>
                <Ionicons name="location" size={18} color={colors.tint} />
                <ThemedText numberOfLines={1} style={styles.locationText}>
                  {locationSummary}
                </ThemedText>
              </View>
              <View style={styles.nameRow}>
                <BottomSheetTextInput
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setNameEdited(true);
                  }}
                  placeholder="Reminder name"
                  placeholderTextColor={colors.icon}
                  style={[
                    styles.nameInput,
                    { color: colors.text, backgroundColor: colors.background },
                  ]}
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
              <BottomSheetTextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What do you want to remember here?"
                placeholderTextColor={colors.icon}
                multiline
                style={[
                  styles.nameInput,
                  styles.descriptionInput,
                  { color: colors.text, backgroundColor: colors.background },
                ]}
              />
              <View style={styles.radiusSection}>
                <ThemedText type="defaultSemiBold">Notification radius</ThemedText>
                <ThemedText style={[styles.radiusHint, { color: colors.icon }]}>
                  The distance from this reminder at which you will be notified.
                </ThemedText>
                {renderRadiusChips()}
              </View>
            </BottomSheetScrollView>
          </Animated.View>
        </View>
      </BottomSheet>

      {mode === 'list' ? (
        <Animated.View style={[styles.fab, fabStyle]}>
          <Pressable
            accessibilityRole="button"
            onPress={openCreate}
            style={({ pressed }) => [
              styles.fabButton,
              { backgroundColor: colors.tint },
              pressed && styles.fabPressed,
            ]}>
            <Ionicons name="add" size={22} color={invertedTextColor} />
            <ThemedText style={[styles.fabText, { color: invertedTextColor }]}>
              Add reminder
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerLogo: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  headerButton: {
    padding: 4,
  },
  mapWrapper: {
    flex: 1,
  },
  sheetBody: {
    flex: 1,
  },
  listPane: {
    ...StyleSheet.absoluteFillObject,
  },
  formPane: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  reminderInfo: {
    flex: 1,
    gap: 2,
  },
  reminderSubtitle: {
    fontSize: 13,
  },
  rowAction: {
    padding: 4,
  },
  formContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
    flexGrow: 1,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formBackButton: {
    padding: 4,
    marginLeft: -4,
  },
  formTitle: {
    fontSize: 17,
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
  radiusSection: {
    gap: 4,
  },
  radiusHint: {
    fontSize: 13,
  },
  radiusChips: {
    gap: 8,
    paddingVertical: 4,
  },
  radiusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  radiusChipText: {
    fontSize: 14,
    fontWeight: '600',
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
  descriptionInput: {
    flex: 0,
    fontSize: 14,
    maxHeight: 88,
    textAlignVertical: 'top',
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
  searchOverlay: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 72,
    zIndex: 30,
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
    maxHeight: 240,
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
  manualPinButton: {
    position: 'absolute',
    top: 8,
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
    zIndex: 25,
  },
  manualPinButtonActive: {
    backgroundColor: '#ef4444',
  },
  recenterButtonPressed: {
    opacity: 0.7,
  },
  fab: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
  },
  fabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.8,
  },
  fabText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
