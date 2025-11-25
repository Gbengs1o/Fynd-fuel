// MapLibre style URLs for OpenFreeMap
// OpenFreeMap provides free vector tiles without API keys

export const MAPLIBRE_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty/style.json',
  dark: 'https://tiles.openfreemap.org/styles/liberty/style.json', // Using same style for now, can be customized
};

// Helper function to get style URL based on theme
export const getMapStyle = (theme: 'light' | 'dark') => {
  return MAPLIBRE_STYLES[theme];
};

// Re-export for compatibility (empty function, not used in MapLibre)
export const createMapStyle = () => [];