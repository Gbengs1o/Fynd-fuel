import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

type SearchScope = 'map' | 'city' | 'country' | 'worldwide';
const SCOPE_OPTIONS: { label: string; value: SearchScope }[] = [
    { label: 'Map View', value: 'map' }, { label: 'City', value: 'city' },
    { label: 'Country', value: 'country' }, { label: 'Worldwide', value: 'worldwide' },
];

interface SearchBarProps {
    searchKey: number;
    setSearchKey: (value: number | ((prevVar: number) => number)) => void;
    currentRegion: Region | null;
    locationInfo: { city?: string; country?: string; countryCode?: string };
    searchScope: SearchScope;
    setSearchScope: (scope: SearchScope) => void;
    onPlaceSelected: (region: Region) => void;
}

export default function SearchBar({ searchKey, setSearchKey, currentRegion, locationInfo, searchScope, setSearchScope, onPlaceSelected }: SearchBarProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => getThemedStyles(colors), [colors]);
    const [isDropdownVisible, setDropdownVisible] = useState(false);

    const placeholderText = useMemo(() => {
        switch (searchScope) {
            case 'city': return `Search within ${locationInfo.city || 'current city'}`;
            case 'country': return `Search within ${locationInfo.country || 'current country'}`;
            case 'map': return 'Search within map view';
            default: return 'Search Worldwide';
        }
    }, [searchScope, locationInfo]);

    const autocompleteQuery = useMemo(() => {
        const baseQuery = { key: GOOGLE_MAPS_API_KEY, language: 'en' };
        if (!currentRegion) return baseQuery;
        switch (searchScope) {
            case 'map': return { ...baseQuery, location: `${currentRegion.latitude},${currentRegion.longitude}`, radius: '20000', strictbounds: true };
            case 'city': return { ...baseQuery, location: `${currentRegion.latitude},${currentRegion.longitude}`, radius: '50000' };
            case 'country': return locationInfo.countryCode ? { ...baseQuery, components: `country:${locationInfo.countryCode}` } : baseQuery;
            default: return baseQuery;
        }
    }, [currentRegion, searchScope, locationInfo.countryCode]);

    return (
        <>
            <View style={styles.searchContainer}>
                <TouchableOpacity style={styles.dropdownButton} onPress={() => setDropdownVisible(!isDropdownVisible)}>
                    <Text style={styles.dropdownButtonText}>{SCOPE_OPTIONS.find(o => o.value === searchScope)?.label}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.autocompleteContainer}>
                    <GooglePlacesAutocomplete
                        key={searchKey} placeholder={placeholderText} fetchDetails={true}
                        onPress={(data, details = null) => {
                            if (details?.geometry?.location) {
                                const { lat, lng } = details.geometry.location;
                                onPlaceSelected({ latitude: lat, longitude: lng, latitudeDelta: 0.1, longitudeDelta: 0.1 });
                                Keyboard.dismiss();
                                setSearchKey(prevKey => prevKey + 1);
                            }
                        }}
                        query={autocompleteQuery}
                        styles={{
                            container: { flex: 1 },
                            textInput: styles.searchInput,
                            listView: styles.listView,
                            row: { backgroundColor: colors.card },
                            description: { color: colors.text },
                            separator: { backgroundColor: colors.border },
                        }}
                        textInputProps={{ placeholderTextColor: colors.placeholder }}
                    />
                </View>
            </View>
            {isDropdownVisible && (
                <View style={styles.dropdownMenu}>
                    {SCOPE_OPTIONS.map(option => (
                        <TouchableOpacity key={option.value} style={styles.dropdownItem} onPress={() => { setSearchScope(option.value as SearchScope); setDropdownVisible(false); setSearchKey(prevKey => prevKey + 1); }}>
                            <Text style={styles.dropdownItemText}>{option.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </>
    );
}

const getThemedStyles = (colors: AppColors) => StyleSheet.create({
    searchContainer: { position: 'absolute', top: 60, left: 15, right: 15, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
    dropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 10, height: 48, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderWidth: 1, borderColor: colors.border, borderRightWidth: 0 },
    dropdownButtonText: { fontWeight: '600', color: colors.text, marginRight: 2 },
    autocompleteContainer: { flex: 1 },
    searchInput: { height: 48, fontSize: 16, backgroundColor: colors.card, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5, color: colors.text },
    listView: { backgroundColor: colors.card, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: colors.border },
    dropdownMenu: { position: 'absolute', top: 110, left: 15, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10, zIndex: 20 },
    dropdownItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    dropdownItemText: { fontSize: 16, color: colors.text },
});