import MapLibreGL from '@maplibre/maplibre-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, View } from 'react-native';
import { useDebouncedCallback } from 'use-debounce';

// Import the new components
import FilterControl from '../../components/home/FilterControl';
import InitialLoadingScreen from '../../components/home/InitialLoadingScreen';
import SearchBar from '../../components/home/SearchBar';
import StationInfoPopup from '../../components/home/StationInfoPopup';
import SubtleActivityIndicator from '../../components/home/SubtleActivityIndicator';
import TripPlanner from '../../components/home/TripPlanner';
import { MAPLIBRE_STYLES } from '../../constants/MapStyle';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

// Define Region type locally to avoid react-native-maps dependency
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
    address?: string;
    price?: number;
    fuel_type?: string;
}

export default function HomeScreen() {
    const { theme, colors } = useTheme();
    const cameraRef = useRef<MapLibreGL.Camera>(null);
    const mapViewRef = useRef<MapLibreGL.MapView>(null);
    const tabBarHeight = useBottomTabBarHeight();

    const [isLoading, setIsLoading] = useState(true);
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStation, setSelectedStation] = useState<Station | null>(null);
    const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
    const [filterTerm, setFilterTerm] = useState('');
    const [searchKey, setSearchKey] = useState(0);
    const [searchScope, setSearchScope] = useState<'map' | 'city' | 'country' | 'worldwide'>('city');
    const [locationInfo, setLocationInfo] = useState<{ city?: string; country?: string; countryCode?: string }>({});
    const [isTripModeActive, setTripModeActive] = useState(false);
    const [isTripLoading, setIsTripLoading] = useState(false);
    const [route, setRoute] = useState<{ geometry: any; bounds: any } | null>(null);

    // Styles
    const styles = useMemo(() => StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        map: { flex: 1 },
    }), [colors]);

    const filteredStations = useMemo(() => {
        if (!filterTerm.trim()) return stations;
        const lowercasedFilter = filterTerm.toLowerCase();
        return stations.filter(s => s.name.toLowerCase().includes(lowercasedFilter));
    }, [stations, filterTerm]);

    // Convert stations to GeoJSON for MapLibre
    const stationsFeatureCollection = useMemo(() => {
        return {
            type: 'FeatureCollection',
            features: filteredStations.map(station => ({
                type: 'Feature',
                id: station.id,
                geometry: {
                    type: 'Point',
                    coordinates: [station.longitude, station.latitude],
                },
                properties: {
                    id: station.id,
                    name: station.name,
                    price: station.price,
                    fuel_type: station.fuel_type,
                },
            })),
        };
    }, [filteredStations]);

    // --- LOGIC & CALLBACKS ---
    const fetchStationsForRegion = useCallback(async (region: Region) => {
        if (!region) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('get-google-stations', { body: { latitude: region.latitude, longitude: region.longitude } });
            if (error) throw error;
            setStations(prevStations => {
                const stationMap = new Map(prevStations.map(s => [s.id, s]));
                (data as Station[]).forEach(newStation => stationMap.set(newStation.id, newStation));
                return Array.from(stationMap.values());
            });
        } catch (err: any) { console.error("Error fetching stations:", err.message); }
        finally { setIsLoading(false); }
    }, []);

    const updateLocationName = useCallback(async (region: Region) => {
        try {
            const result = await Location.reverseGeocodeAsync({ latitude: region.latitude, longitude: region.longitude });
            if (result.length > 0) {
                const { city, country, isoCountryCode } = result[0];
                setLocationInfo({ city, country, countryCode: isoCountryCode });
            }
        } catch (error) { console.error("Reverse geocoding failed (handled):", error); }
    }, []);

    const debouncedFetch = useDebouncedCallback(fetchStationsForRegion, 400);
    const debouncedUpdateLocationName = useDebouncedCallback(updateLocationName, 500);

    useEffect(() => {
        const setupInitialScreen = async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                let initialRegion: Region;
                if (status !== 'granted') {
                    Alert.alert('Permission Denied', 'Showing default location.');
                    initialRegion = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.1, longitudeDelta: 0.1 };
                } else {
                    const location = await Location.getLastKnownPositionAsync({}) || await Location.getCurrentPositionAsync({});
                    initialRegion = { latitude: location.coords.latitude, longitude: location.coords.longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 };
                }
                setCurrentRegion(initialRegion);
                // Initial fetch will happen via onRegionDidChange
            } catch (error) {
                console.error("Failed to setup initial screen:", error);
                const fallbackRegion = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.1, longitudeDelta: 0.1 };
                setCurrentRegion(fallbackRegion);
            }
        };
        setupInitialScreen();
    }, []);

    const handleStationPress = async (e: any) => {
        if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const stationId = feature.properties.id;
            const station = stations.find(s => s.id === stationId);
            if (station) {
                setSelectedStation(station);
                cameraRef.current?.setCamera({
                    centerCoordinate: [station.longitude, station.latitude],
                    zoomLevel: 15,
                    animationDuration: 500,
                });
            }
        }
    };

    const handlePlaceSelected = (newRegion: Region) => {
        cameraRef.current?.setCamera({
            centerCoordinate: [newRegion.longitude, newRegion.latitude],
            zoomLevel: 14, // Approximate zoom for the delta
            animationDuration: 1000,
        });
    };

    const handleMapPress = () => {
        if (selectedStation) setSelectedStation(null);
        Keyboard.dismiss();
    };

    const onRegionDidChange = async (feature: any) => {
        const { coordinates } = feature.geometry;
        const [longitude, latitude] = coordinates;
        // Approximate deltas based on zoom level or bounds if available, 
        // but for now just passing lat/lon is enough for the fetcher usually.
        // We can construct a Region object.
        const region: Region = {
            latitude,
            longitude,
            latitudeDelta: 0.05, // Placeholder
            longitudeDelta: 0.05, // Placeholder
        };
        setCurrentRegion(region);
        debouncedFetch(region);
        if (!isTripModeActive) { debouncedUpdateLocationName(region); }
    };

    const handleFindTrip = async (destinationPlaceId: string) => {
        Keyboard.dismiss(); setIsTripLoading(true);
        try {
            const location = await Location.getCurrentPositionAsync({});
            const { latitude: startLat, longitude: startLon } = location.coords;

            // Use OSRM via our supabase function or direct call? 
            // The original code used 'get-trip-details' which likely used Google Directions.
            // We should switch to OSRM. 
            // For now, let's assume 'get-trip-details' is updated or we use a new one.
            // Actually, let's use the public OSRM API directly for client-side routing if possible, 
            // or keep using the backend function if it's been updated.
            // Since I can't see the backend, I'll assume I need to fetch the route geometry.

            // Let's use a direct OSRM call for now as per the migration plan.
            // First get destination coordinates from placeId (still using Google Places for search)
            // We might need to fetch details for the placeId first.
            const { data: placeData, error: placeError } = await supabase.functions.invoke('get-place-details', { body: { placeId: destinationPlaceId } });
            if (placeError) throw placeError;

            const destLat = placeData.result.geometry.location.lat;
            const destLng = placeData.result.geometry.location.lng;

            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`);
            const json = await response.json();

            if (json.code !== 'Ok') throw new Error('Failed to find route');

            const routeGeometry = json.routes[0].geometry;
            const bbox = json.routes[0].legs[0].summary ? null : null; // OSRM doesn't always return bounds in the same way

            setStations([]); // Clear stations or fetch along route?
            setRoute({ geometry: routeGeometry, bounds: null }); // We can calculate bounds if needed
            setTripModeActive(true);

            // Fit bounds
            // Simple bounds calculation from geometry
            const coords = routeGeometry.coordinates;
            let minLon = coords[0][0], maxLon = coords[0][0], minLat = coords[0][1], maxLat = coords[0][1];
            coords.forEach((c: number[]) => {
                if (c[0] < minLon) minLon = c[0];
                if (c[0] > maxLon) maxLon = c[0];
                if (c[1] < minLat) minLat = c[1];
                if (c[1] > maxLat) maxLat = c[1];
            });

            cameraRef.current?.fitBounds(
                [minLon, minLat],
                [maxLon, maxLat],
                [50, 50, 150, 50], // padding
                1000 // duration
            );

        } catch (err: any) { Alert.alert("Error Finding Route", err.message); }
        finally { setIsTripLoading(false); }
    };

    const cancelTripMode = () => {
        setTripModeActive(false); setRoute(null);
        if (currentRegion) {
            cameraRef.current?.setCamera({
                centerCoordinate: [currentRegion.longitude, currentRegion.latitude],
                zoomLevel: 14,
                animationDuration: 500
            });
            debouncedFetch(currentRegion);
        }
    };

    if (!currentRegion) {
        return <InitialLoadingScreen message="Finding your location..." />;
    }

    return (
        <View style={styles.container}>
            <MapLibreGL.MapView
                ref={mapViewRef}
                style={styles.map}
                styleURL={theme === 'dark' ? MAPLIBRE_STYLES.dark : MAPLIBRE_STYLES.light}
                onRegionDidChange={onRegionDidChange}
                onPress={handleMapPress}
                logoEnabled={false}
                attributionEnabled={false} // OpenFreeMap attribution usually handled elsewhere or unobtrusive
            >
                <MapLibreGL.Camera
                    ref={cameraRef}
                    defaultSettings={{
                        centerCoordinate: [currentRegion.longitude, currentRegion.latitude],
                        zoomLevel: 14,
                    }}
                />

                <MapLibreGL.UserLocation visible={true} />

                {/* Stations Layer with Clustering */}
                <MapLibreGL.ShapeSource
                    id="stationsSource"
                    shape={stationsFeatureCollection as any}
                    cluster
                    clusterRadius={50}
                    clusterMaxZoomLevel={14}
                    onPress={handleStationPress}
                >
                    <MapLibreGL.SymbolLayer
                        id="pointCount"
                        style={{
                            textField: ['get', 'point_count'],
                            textSize: 12,
                            textColor: colors.text,
                            textIgnorePlacement: false,
                            textAllowOverlap: false,
                        }}
                    />
                    <MapLibreGL.CircleLayer
                        id="clusteredPoints"
                        belowLayerID="pointCount"
                        filter={['has', 'point_count']}
                        style={{
                            circleColor: colors.primary,
                            circleRadius: 18,
                            circleStrokeWidth: 2,
                            circleStrokeColor: colors.background,
                        }}
                    />
                    <MapLibreGL.SymbolLayer
                        id="unclusteredPoints"
                        filter={['!', ['has', 'point_count']]}
                        style={{
                            iconImage: 'fuel-15', // You might need to load an image or use a circle
                            iconSize: 1.5,
                            iconColor: colors.pinDefault,
                            iconAllowOverlap: true,
                        }}
                    />
                    {/* Fallback for unclustered points if no icon - using CircleLayer */}
                    <MapLibreGL.CircleLayer
                        id="singlePoint"
                        filter={['!', ['has', 'point_count']]}
                        style={{
                            circleColor: ['case', ['==', ['get', 'id'], selectedStation?.id || -1], colors.primary, colors.pinDefault],
                            circleRadius: 10,
                            circleStrokeWidth: 2,
                            circleStrokeColor: colors.background,
                        }}
                    />
                </MapLibreGL.ShapeSource>

                {/* Route Layer */}
                {isTripModeActive && route && (
                    <MapLibreGL.ShapeSource id="routeSource" shape={route.geometry}>
                        <MapLibreGL.LineLayer
                            id="routeFill"
                            style={{
                                lineColor: colors.primary,
                                lineWidth: 5,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                )}

            </MapLibreGL.MapView>

            {!isTripModeActive && (
                <>
                    <SearchBar searchKey={searchKey} setSearchKey={setSearchKey} currentRegion={currentRegion} locationInfo={locationInfo} searchScope={searchScope} setSearchScope={setSearchScope} onPlaceSelected={handlePlaceSelected} />
                    <FilterControl filterTerm={filterTerm} onApplyFilter={setFilterTerm} />
                </>
            )}

            <TripPlanner isTripModeActive={isTripModeActive} onCancelTrip={cancelTripMode} onFindTrip={handleFindTrip} tabBarHeight={tabBarHeight} currentRegion={currentRegion} locationInfo={locationInfo} />
            <StationInfoPopup station={selectedStation} onClose={() => setSelectedStation(null)} tabBarHeight={tabBarHeight} />
            <SubtleActivityIndicator visible={isLoading || isTripLoading} />
        </View>
    );
}