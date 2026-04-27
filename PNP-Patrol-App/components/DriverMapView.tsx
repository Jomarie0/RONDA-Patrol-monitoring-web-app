import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';

// Platform-specific import for MapView
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_DEFAULT: any = null;

if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
  PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
}

type GPSPoint = {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  speed?: number;
};

type DriverMapViewProps = {
  sessionId: number;
  isSessionActive: boolean;
};

const { width, height } = Dimensions.get('window');

export default function DriverMapView({ sessionId, isSessionActive }: DriverMapViewProps) {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<GPSPoint[]>([]);
  const [mapRegion, setMapRegion] = useState({
    latitude: 14.5995, // Default Manila coordinates
    longitude: 120.9842,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mapRef = useRef<any>(null);

  // Get current location and center map
  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission not granted');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setCurrentLocation(location);
      
      const newRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setMapRegion(newRegion);
      
      // Center map on current location
      if (mapRef.current) {
        mapRef.current.animateToRegion(newRegion, 1000);
      }

      return location;
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError('Unable to get current location');
      return null;
    }
  };

  // Initialize map with current location
  useEffect(() => {
    if (isSessionActive) {
      setIsLoading(true);
      getCurrentLocation().finally(() => setIsLoading(false));
    }
  }, [isSessionActive]);

  // Track location updates during active session
  useEffect(() => {
    if (!isSessionActive) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Location permission not granted');
          return;
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // Update every 5 seconds
            distanceInterval: 10, // Update every 10 meters
          },
          (location) => {
            setCurrentLocation(location);
            
            // Add to route coordinates
            const newPoint: GPSPoint = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              timestamp: new Date().toISOString(),
              accuracy: location.coords.accuracy || undefined,
              speed: location.coords.speed || undefined,
            };

            setRouteCoordinates(prev => {
              // Keep only last 100 points to avoid memory issues
              const updated = [...prev, newPoint];
              return updated.slice(-100);
            });

            // Update map region to follow current location
            const newRegion = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            };

            setMapRegion(newRegion);

            // Smoothly animate map to new location
            if (mapRef.current) {
              mapRef.current.animateToRegion(newRegion, 500);
            }
          }
        );
      } catch (error) {
        console.error('Error starting location tracking:', error);
        setLocationError('Failed to start location tracking');
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isSessionActive, sessionId]);

  if (!isSessionActive) {
    return null;
  }

  // Web fallback - show location info without map
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>📍 Live Patrol Tracking</Text>
          <Text style={styles.mapSubtitle}>
            {currentLocation ? 
              `Speed: ${currentLocation.coords.speed ? `${(currentLocation.coords.speed * 3.6).toFixed(1)} km/h` : 'Stationary'}` : 
              'Acquiring GPS...'
            }
          </Text>
        </View>
        
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackText}>
            🗺️ Map view is available on mobile devices only
          </Text>
          <Text style={styles.webFallbackSubtext}>
            Current Location: {currentLocation ? 
              `${currentLocation.coords.latitude.toFixed(6)}, ${currentLocation.coords.longitude.toFixed(6)}` : 
              'Acquiring...'
            }
          </Text>
          <Text style={styles.webFallbackSubtext}>
            Route Points: {routeCoordinates.length}
          </Text>
        </View>

        <View style={styles.mapFooter}>
          <Text style={styles.footerText}>
            Session: #{sessionId} | Web Mode
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  if (locationError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{locationError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapHeader}>
        <Text style={styles.mapTitle}>📍 Live Patrol Tracking</Text>
        <Text style={styles.mapSubtitle}>
          {currentLocation ? 
            `Speed: ${currentLocation.coords.speed ? `${(currentLocation.coords.speed * 3.6).toFixed(1)} km/h` : 'Stationary'}` : 
            'Acquiring GPS...'
          }
        </Text>
      </View>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={mapRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        followsUserLocation={true}
        loadingEnabled={true}
        loadingIndicatorColor="#1e3a5f"
        showsCompass={true}
        showsScale={true}
        zoomEnabled={true}
        pitchEnabled={true}
        rotateEnabled={true}
      >
        {/* Current position marker */}
        {currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }}
            title="Current Position"
            description={`Accuracy: ${currentLocation.coords.accuracy ? currentLocation.coords.accuracy.toFixed(1) : 'N/A'}m`}
            pinColor="#1e3a5f"
          />
        )}

        {/* Route polyline */}
        {routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#2e7d32"
            strokeWidth={3}
          />
        )}
      </MapView>

      <View style={styles.mapFooter}>
        <Text style={styles.footerText}>
          Route Points: {routeCoordinates.length} | Session: #{sessionId}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: height * 0.5, // Half screen height
    marginVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e3a5f',
  },
  mapHeader: {
    backgroundColor: '#1e3a5f',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  mapSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  map: {
    flex: 1,
  },
  mapFooter: {
    backgroundColor: '#1e3a5f',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  loadingContainer: {
    height: height * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    marginVertical: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#fff',
  },
  errorContainer: {
    height: height * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    marginVertical: 16,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
  },
  webFallbackText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  webFallbackSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 8,
  },
});
