// File: app/map.tsx

import { FontAwesome, Ionicons } from '@expo/vector-icons';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MAPLIBRE_STYLES } from '../../constants/MapStyle';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

// Local Region type definition
type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
};

interface Station {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    price?: number;
    address?: string;
}

interface RouteStep {
    maneuver: {
        location: [number, number];
        instruction: string;
    };
}

export default function MapScreen() {
    const { theme, colors } = useTheme();
    const mapRef = useRef<MapLibreGL.MapView>(null);
    const cameraRef = useRef<MapLibreGL.Camera>(null);

    const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
    const [stations, setStations] = useState<Station[]>([]);
    const [routeCoordinates, setRouteCoordinates] = useState<any>(null); // GeoJSON LineString
    const [routeDistance, setRouteDistance] = useState<string>('');
    const [routeDuration, setRouteDuration] = useState<string>('');
    const [isRouting, setIsRouting] = useState(false);
    const [destinationQuery, setDestinationQuery] = useState('');
    const [isNavigating, setIsNavigating] = useState(false);

    // Styles
    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        map: { flex: 1 },
        searchContainer: {
            position: 'absolute',
            top: 60,
            left: 20,
            right: 20,
            backgroundColor: colors.card,
            borderRadius: 12,
            padding: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 5,
            zIndex: 10,
        },
        inputRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        input: {
            flex: 1,
            marginLeft: 10,
            fontSize: 16,
            color: colors.text,
        },
        routeInfoContainer: {
            position: 'absolute',
            bottom: 40,
            left: 20,
            right: 20,
            backgroundColor: colors.card,
            padding: 16,
            borderRadius: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 5,
        },
        routeStats: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 16,
        },
        statItem: {
            alignItems: 'center',
        },
        statValue: {
            fontSize: 18,
            fontWeight: 'bold',
            color: colors.text,
        },
        statLabel: {
            fontSize: 12,
            color: colors.textSecondary,
        },
        startButton: {
            backgroundColor: colors.primary,
            padding: 16,
            borderRadius: 12,
            alignItems: 'center',
        },
        startButtonText: {
            color: '#fff',
            fontSize: 18,
            fontWeight: 'bold',
        },
        stopButton: {
            backgroundColor: '#E53935',
            padding: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 10,
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
            setUserLocation(location);
        })();
    }, []);

    const fetchRoute = async (destLat: number, destLng: number) => {
        if (!userLocation) return;

        setIsRouting(true);
        try {
            const startLat = userLocation.coords.latitude;
            const startLng = userLocation.coords.longitude;

            // Use OSRM public API
            const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`
            );
            const data = await response.json();

            if (data.code === 'Ok' && data.routes.length > 0) {
                const route = data.routes[0];
                setRouteCoordinates({
                    type: 'LineString',
                    coordinates: route.geometry.coordinates,
                });
                setRouteDistance((route.distance / 1000).toFixed(1) + ' km');
                setRouteDuration(Math.round(route.duration / 60) + ' min');

                // Fit camera to route
                const coordinates = route.geometry.coordinates;
                const bounds = coordinates.reduce((acc: any, coord: any) => {
                    return {
                        ne: [Math.max(acc.ne[0], coord[0]), Math.max(acc.ne[1], coord[1])],
                        sw: [Math.min(acc.sw[0], coord[0]), Math.min(acc.sw[1], coord[1])],
                    };
                }, { ne: [coordinates[0][0], coordinates[0][1]], sw: [coordinates[0][0], coordinates[0][1]] });

                cameraRef.current?.fitBounds(bounds.ne, bounds.sw, 50, 1000);

                // Fetch stations along route (simplified: just nearby destination for now)
                fetchStationsNearby(destLat, destLng);
            }
        } catch (error) {
            console.error("Routing error:", error);
            Alert.alert("Error", "Failed to calculate route");
        } finally {
            setIsRouting(false);
        }
    };

    const fetchStationsNearby = async (lat: number, lng: number) => {
        try {
            const { data, error } = await supabase
                .rpc('get_nearby_stations', {
                    lat,
                    long: lng,
                    radius_meters: 5000 // 5km radius around destination
                });

            if (error) throw error;
            if (data) setStations(data);
        } catch (error) {
            console.error("Error fetching stations:", error);
        }
    };

    const handleSearch = async () => {
        if (!destinationQuery.trim()) return;

        // Simple geocoding using Nominatim (OpenStreetMap)
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationQuery)}`
            );
            const data = await response.json();

            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);
                fetchRoute(lat, lng);
            } else {
                Alert.alert("Not Found", "Could not find location");
            }
        } catch (error) {
            console.error("Geocoding error:", error);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.inputRow}>
                    <Ionicons name="search" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={styles.input}
                        placeholder="Where to? (e.g. Central Park)"
                        placeholderTextColor={colors.textSecondary}
                        value={destinationQuery}
                        onChangeText={setDestinationQuery}
                        onSubmitEditing={handleSearch}
                    />
                    {isRouting && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
            </View>

            <MapLibreGL.MapView
                ref={mapRef}
                style={styles.map}
                styleURL={theme === 'dark' ? MAPLIBRE_STYLES.dark : MAPLIBRE_STYLES.light}
                logoEnabled={false}
                attributionEnabled={false}
            >
                <MapLibreGL.Camera
                    ref={cameraRef}
                    defaultSettings={{
                        centerCoordinate: [userLocation?.coords.longitude || 0, userLocation?.coords.latitude || 0],
                        zoomLevel: 12,
                    }}
                    followUserLocation={!routeCoordinates}
                    followUserMode={MapLibreGL.UserTrackingMode.Follow}
                />

                <MapLibreGL.UserLocation visible={true} />

                {/* Route Line */}
                {routeCoordinates && (
                    <MapLibreGL.ShapeSource id="routeSource" shape={routeCoordinates}>
                        <MapLibreGL.LineLayer
                            id="routeFill"
                            style={{
                                lineColor: colors.primary,
                                lineWidth: 5,
                                lineOpacity: 0.8,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                )}

                {/* Stations Markers */}
                {stations.map((station) => (
                    <MapLibreGL.PointAnnotation
                        key={station.id}
                        id={`station-${station.id}`}
                        coordinate={[station.longitude, station.latitude]}
                    >
                        <View style={{
                            backgroundColor: '#fff',
                            padding: 5,
                            borderRadius: 15,
                            borderWidth: 2,
                            borderColor: colors.primary,
                        }}>
                            <FontAwesome name="gas-pump" size={16} color={colors.primary} />
                        </View>
                        <MapLibreGL.Callout title={station.name} />
                    </MapLibreGL.PointAnnotation>
                ))}
            </MapLibreGL.MapView>

            {routeCoordinates && (
                <View style={styles.routeInfoContainer}>
                    <View style={styles.routeStats}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{routeDistance}</Text>
                            <Text style={styles.statLabel}>Distance</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{routeDuration}</Text>
                            <Text style={styles.statLabel}>Duration</Text>
                        </View>
                    </View>

                    {!isNavigating ? (
                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={() => setIsNavigating(true)}
                        >
                            <Text style={styles.startButtonText}>Start Navigation</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.stopButton}
                            onPress={() => {
                                setIsNavigating(false);
                                setRouteCoordinates(null);
                                setDestinationQuery('');
                                cameraRef.current?.setCamera({
                                    zoomLevel: 14,
                                    animationDuration: 1000,
                                });
                            }}
                        >
                            <Text style={styles.startButtonText}>End Navigation</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}