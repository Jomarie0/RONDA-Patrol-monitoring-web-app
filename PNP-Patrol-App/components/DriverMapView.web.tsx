import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';

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

const { height } = Dimensions.get('window');

export default function DriverMapView({ sessionId, isSessionActive }: DriverMapViewProps) {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<GPSPoint[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get current location
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
      return location;
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError('Unable to get current location');
      return null;
    }
  };

  // Initialize with current location
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.loadingText}>Loading location...</Text>
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
          Accuracy: {currentLocation?.coords.accuracy ? `${currentLocation.coords.accuracy.toFixed(1)}m` : 'N/A'}
        </Text>
        <Text style={styles.webFallbackSubtext}>
          Route Points: {routeCoordinates.length}
        </Text>
        <Text style={styles.webFallbackSubtext}>
          Session: #{sessionId}
        </Text>
      </View>

      <View style={styles.mapFooter}>
        <Text style={styles.footerText}>
          Web Mode - GPS tracking active without map visualization
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
});
