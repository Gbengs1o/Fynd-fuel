import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { useTheme } from '../../context/ThemeContext';

// Local Region type definition (no longer using react-native-maps)
type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
};

type AppColors = ReturnType<typeof useTheme>['colors'];

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || Constants.expoConfig?.web?.config?.googleMaps?.apiKey;

type TripSearchScope = 'city' | 'country';
const TRIP_SCOPE_OPTIONS: { label: string; value: TripSearchScope }[] = [{ label: 'City', value: 'city' }, { label: 'Country', value: 'country' }];

interface TripPlannerProps {
    isTripModeActive: boolean;
    onCancelTrip: () => void;
    onFindTrip: (destinationPlaceId: string) => void;
    tabBarHeight: number;
    currentRegion: Region | null;
    locationInfo: { countryCode?: string };
}

export default function TripPlanner({ isTripModeActive, onCancelTrip, onFindTrip, tabBarHeight, currentRegion, locationInfo }: TripPlannerProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => getThemedStyles(colors), [colors]);
    const [isTripModalVisible, setTripModalVisible] = useState(false);
    const [tripSearchScope, setTripSearchScope] = useState<TripSearchScope>('city');

    const tripAutocompleteQuery = useMemo(() => {
        const baseQuery = { key: GOOGLE_MAPS_API_KEY, language: 'en' };
        if (!currentRegion) return baseQuery;
        switch (tripSearchScope) {
            case 'country': return locationInfo.countryCode ? { ...baseQuery, components: `country:${locationInfo.countryCode}` } : baseQuery;
            default: return { ...baseQuery, location: `${currentRegion.latitude},${currentRegion.longitude}`, radius: '50000' };
        }
    }, [currentRegion, tripSearchScope, locationInfo.countryCode]);

    const handleDestinationSelected = (details: any) => {
        if (details?.place_id) {
            setTripModalVisible(false);
            onFindTrip(details.place_id);
        }
    }

    if (isTripModeActive) {
        return (
            <TouchableOpacity style={[styles.tripActionButton, { bottom: tabBarHeight + 20 }]} onPress={onCancelTrip}>
                <MaterialCommunityIcons name="close" size={24} color={colors.destructive} />
                <Text style={styles.tripCancelText}>Cancel Trip</Text>
            </TouchableOpacity>
        );
    }

    return (
        <>
            <TouchableOpacity style={[styles.tripActionButton, { bottom: tabBarHeight + 20 }]} onPress={() => setTripModalVisible(true)}>
                <MaterialCommunityIcons name="directions" size={24} color={colors.text} />
            </TouchableOpacity>
            <Modal visible={isTripModalVisible} animationType="slide" onRequestClose={() => setTripModalVisible(false)}>
                <View style={styles.tripModalContainer}>
                    <Text style={styles.tripModalTitle}>Plan a Trip</Text>
                    <Text style={styles.tripModalSubtitle}>Find stations along your route</Text>
                    <View style={styles.tripSearchContainer}>
                        <TouchableOpacity style={styles.dropdownButton}>
                            <Text style={styles.dropdownButtonText}>{TRIP_SCOPE_OPTIONS.find(o => o.value === tripSearchScope)?.label}</Text>
                        </TouchableOpacity>
                        <View style={styles.autocompleteContainer}>
                            <GooglePlacesAutocomplete
                                placeholder="Enter destination..."
                                fetchDetails={true}
                                onPress={(data, details) => handleDestinationSelected(details)}
                                query={tripAutocompleteQuery}
                                styles={{
                                    textInput: styles.searchInput,
                                    container: { flex: 1 },
                                    listView: styles.listView,
                                    row: { backgroundColor: colors.card },
                                    description: { color: colors.text },
                                    separator: { backgroundColor: colors.border },
                                }}
                                textInputProps={{ placeholderTextColor: colors.placeholder }}
                            />
                        </View>
                    </View>
                    <TouchableOpacity style={styles.tripModalCloseButton} onPress={() => setTripModalVisible(false)}>
                        <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </>
    );
}

const getThemedStyles = (colors: AppColors) => StyleSheet.create({
    tripActionButton: { position: 'absolute', right: 15, backgroundColor: colors.card, borderRadius: 30, padding: 15, flexDirection: 'row', alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 8, zIndex: 10 },
    tripCancelText: { marginLeft: 8, fontWeight: 'bold', color: colors.destructive, fontSize: 16 },
    tripModalContainer: { flex: 1, paddingTop: 80, paddingHorizontal: 20, backgroundColor: colors.background },
    tripModalTitle: { fontSize: 28, fontWeight: 'bold', color: colors.text, textAlign: 'center' },
    tripModalSubtitle: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
    tripSearchContainer: { flexDirection: 'row', alignItems: 'center', zIndex: 100 },
    tripModalCloseButton: { backgroundColor: colors.destructive, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 30 },
    dropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 10, height: 48, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderWidth: 1, borderColor: colors.border, borderRightWidth: 0 },
    dropdownButtonText: { fontWeight: '600', color: colors.text, marginRight: 2 },
    autocompleteContainer: { flex: 1 },
    searchInput: { height: 48, fontSize: 16, backgroundColor: colors.card, color: colors.text, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
    listView: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, zIndex: 1000 },
    buttonText: { color: colors.primaryText, fontWeight: '600', fontSize: 16 },
});