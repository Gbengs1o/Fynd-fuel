// File: app/addStation.tsx

import { FontAwesome } from '@expo/vector-icons';
import MapLibreGL from '@maplibre/maplibre-react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { router, Stack } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAPLIBRE_STYLES } from '../../constants/MapStyle';
import { useAuth } from '../../context/AuthContext'; // 1. Import useAuth to get the user
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

// Keep Google Maps API Key for Places Autocomplete if needed, but MapLibre doesn't need it.
const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.web?.config?.googleMaps?.apiKey || 'YOUR_GOOGLE_MAPS_API_KEY_FALLBACK';

interface GooglePlace {
    place_id: string;
    name: string;
    vicinity: string;
    geometry: { location: { lat: number; lng: number; } };
}

export default function AddStationScreen() {
    const { theme, colors } = useTheme();
    const { user } = useAuth(); // 2. Get the authenticated user
    const mapRef = useRef<MapLibreGL.MapView>(null);
    const cameraRef = useRef<MapLibreGL.Camera>(null);

    const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
    const [address, setAddress] = useState('');
    const [stationName, setStationName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<GooglePlace[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearch, setShowSearch] = useState(false);

    // Styles
    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        mapContainer: { flex: 1, position: 'relative' },
        map: { flex: 1 },
        centerMarkerContainer: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            marginLeft: -24,
            marginTop: -48,
            zIndex: 2,
        },
        formContainer: {
            padding: 20,
            backgroundColor: colors.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 5,
        },
        label: {
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 8,
            color: colors.text,
        },
        input: {
            backgroundColor: colors.background,
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 16,
            color: colors.text,
            borderWidth: 1,
            borderColor: colors.border,
        },
        addressText: {
            fontSize: 14,
            color: colors.textSecondary,
            marginBottom: 16,
            fontStyle: 'italic',
        },
        submitButton: {
            backgroundColor: colors.primary,
            padding: 16,
            borderRadius: 12,
            alignItems: 'center',
        },
        submitButtonText: {
            color: '#fff',
            fontSize: 18,
            fontWeight: 'bold',
        },
        searchContainer: {
            position: 'absolute',
            top: 60,
            left: 20,
            right: 20,
            zIndex: 10,
        },
        searchInput: {
            backgroundColor: colors.card,
            padding: 12,
            borderRadius: 8,
            fontSize: 16,
            color: colors.text,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
        },
        resultsList: {
            backgroundColor: colors.card,
            marginTop: 5,
            borderRadius: 8,
            maxHeight: 200,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
        },
        resultItem: {
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        resultText: {
            fontSize: 16,
            fontWeight: '500',
            color: colors.text,
        },
        resultSubtext: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 2,
        },
    });

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission to access location was denied');
                return;
            }

            let location = await Location.getCurrentPositionAsync({});
            setRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            });

            // Initial reverse geocode
            reverseGeocode(location.coords.latitude, location.coords.longitude);
        })();
    }, []);

    const reverseGeocode = async (latitude: number, longitude: number) => {
        try {
            const result = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (result.length > 0) {
                const { street, name, city, region, country } = result[0];
                const formattedAddress = [name, street, city, region, country].filter(Boolean).join(', ');
                setAddress(formattedAddress);
            }
        } catch (error) {
            console.log("Reverse geocode error", error);
        }
    };

    const onRegionDidChange = async (feature: any) => {
        const { coordinates } = feature.geometry;
        const [longitude, latitude] = coordinates;

        setRegion({
            latitude,
            longitude,
            latitudeDelta: 0.01, // approximate
            longitudeDelta: 0.01, // approximate
        });

        // Debounce this in a real app
        reverseGeocode(latitude, longitude);
    };

    const handleSearch = async (text: string) => {
        setSearchQuery(text);
        if (text.length < 3) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            // Use Google Places Autocomplete API via Supabase Edge Function or direct fetch if allowed
            // For now, assuming we might still use Google Places for search even if map is MapLibre
            // Or we could use a free geocoder like Nominatim, but Google is better for places.
            // Let's use the existing pattern if possible.

            // Simulating search for now or using a direct fetch if key is available
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_API_KEY}&types=establishment`
            );
            const data = await response.json();
            if (data.status === 'OK') {
                setSearchResults(data.predictions.map((p: any) => ({
                    place_id: p.place_id,
                    name: p.structured_formatting.main_text,
                    vicinity: p.structured_formatting.secondary_text,
                })));
            }
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const selectPlace = async (place: GooglePlace) => {
        setSearchQuery(place.name);
        setSearchResults([]);
        setShowSearch(false);
        setStationName(place.name);

        try {
            // Get place details for coordinates
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`
            );
            const data = await response.json();

            if (data.status === 'OK') {
                const { lat, lng } = data.result.geometry.location;
                cameraRef.current?.setCamera({
                    centerCoordinate: [lng, lat],
                    zoomLevel: 16,
                    animationDuration: 1000,
                });
                setRegion({
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                });
                reverseGeocode(lat, lng);
            }
        } catch (error) {
            console.error("Place details error:", error);
        }
    };

    const handleSubmit = async () => {
        if (!stationName.trim()) {
            Alert.alert("Error", "Please enter a station name");
            return;
        }
        if (!region) {
            Alert.alert("Error", "Location not selected");
            return;
        }

        // 3. Check if user is authenticated
        if (!user) {
            Alert.alert("Authentication Required", "You must be logged in to add a station.", [
                { text: "Cancel", style: "cancel" },
                { text: "Login", onPress: () => router.push('/(auth)/login') } // Adjust route as needed
            ]);
            return;
        }

        setIsSubmitting(true);
        try {
            const { data, error } = await supabase
                .from('stations')
                .insert([
                    {
                        name: stationName,
                        latitude: region.latitude,
                        longitude: region.longitude,
                        address: address,
                        submitted_by: user.id, // 4. Include the user ID
                        status: 'pending' // Optional: if you have a moderation flow
                    }
                ])
                .select();

            if (error) throw error;

            Alert.alert("Success", "Station added successfully!", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to add station");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Add New Station', headerBackTitle: 'Back' }} />

            <View style={styles.mapContainer}>
                {region && (
                    <MapLibreGL.MapView
                        ref={mapRef}
                        style={styles.map}
                        styleURL={theme === 'dark' ? MAPLIBRE_STYLES.dark : MAPLIBRE_STYLES.light}
                        onRegionDidChange={onRegionDidChange}
                        logoEnabled={false}
                        attributionEnabled={false}
                    >
                        <MapLibreGL.Camera
                            ref={cameraRef}
                            defaultSettings={{
                                centerCoordinate: [region.longitude, region.latitude],
                                zoomLevel: 15,
                            }}
                        />
                    </MapLibreGL.MapView>
                )}

                {/* Center Marker (Static) */}
                <View style={styles.centerMarkerContainer}>
                    <FontAwesome name="map-marker" size={48} color={colors.primary} />
                </View>

                {/* Search Bar Overlay */}
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search for a place..."
                        placeholderTextColor={colors.textSecondary}
                        value={searchQuery}
                        onChangeText={handleSearch}
                        onFocus={() => setShowSearch(true)}
                    />
                    {showSearch && searchResults.length > 0 && (
                        <FlatList
                            data={searchResults}
                            keyExtractor={(item) => item.place_id}
                            style={styles.resultsList}
                            renderItem={({ item }) => (
                                <Pressable style={styles.resultItem} onPress={() => selectPlace(item)}>
                                    <Text style={styles.resultText}>{item.name}</Text>
                                    <Text style={styles.resultSubtext}>{item.vicinity}</Text>
                                </Pressable>
                            )}
                        />
                    )}
                </View>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.formContainer}>
                    <Text style={styles.label}>Station Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Shell Station"
                        placeholderTextColor={colors.textSecondary}
                        value={stationName}
                        onChangeText={setStationName}
                    />

                    <Text style={styles.label}>Address</Text>
                    <Text style={styles.addressText}>{address || "Move map to select location"}</Text>

                    <Pressable
                        style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitButtonText}>Add Station</Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}