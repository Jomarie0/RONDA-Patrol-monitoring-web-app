import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/lib/auth-context';
import { ronda } from '@/lib/api';
import { pushToQueue, flushQueue, getQueue } from '@/lib/gps-queue';
import { useRouter } from 'expo-router';

const GPS_INTERVAL_MS = 5000; // Base interval (will be adapted)
const MIN_DISTANCE_METERS = 5; // Minimum movement to trigger update

// Adaptive GPS interval based on movement
const getAdaptiveInterval = (speed?: number | null) => {
  if (!speed || speed === 0) return 30000;      // Stationary: 30s
  if (speed < 2) return 15000;                 // Walking: 15s
  if (speed < 8) return 10000;                 // Slow vehicle: 10s
  return 5000;                                 // Fast vehicle: 5s
};

type Session = {
  id: number;
  is_active: boolean;
  driver_username: string;
  vehicle_plate?: string;
  branch_name?: string;
  start_time: string;
  end_time: string | null;
};

type Vehicle = {
  id: number;
  plate_number: string;
  name?: string;
  branch_name?: string;
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGpsTime, setLastGpsTime] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const adaptiveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await ronda.sessions.list();
      const list = Array.isArray(data) ? data : data.results || [];
      const active = list.find((s: Session) => s.is_active);
      setSession(active || null);
      setError(null);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to load session';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchVehicles = useCallback(async () => {
    try {
      const data = await ronda.vehicles.list();
      const list = Array.isArray(data) ? data : data.results || [];
      setVehicles(list);
      if (list.length === 1) setSelectedVehicleId((list[0] as Vehicle).id);
    } catch (_) {
      setVehicles([]);
    }
  }, []);

  useEffect(() => {
    if (!session?.is_active) fetchVehicles();
  }, [session?.is_active, fetchVehicles]);

  const sendOrQueueGps = useCallback(
    async (sessionId: number, lat: number, lon: number, timestamp: string) => {
      try {
        await ronda.gpsLogs.create(sessionId, lat, lon, timestamp);
        setLastGpsTime(timestamp);
        console.log('✅ GPS data sent successfully:', { sessionId, lat, lon, timestamp });
      } catch (error) {
        console.log('📦 GPS send failed, queuing data:', { sessionId, lat, lon, timestamp, error });
        await pushToQueue({ sessionId, latitude: lat, longitude: lon, timestamp });
        const { getQueue } = await import('@/lib/gps-queue');
        const q = await getQueue();
        setQueuedCount(q.length);
        console.log('📋 Queue size after adding:', q.length);
      }
    },
    []
  );

  const captureAndSendGps = useCallback(async () => {
    if (!session?.is_active) return;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const ts = new Date().toISOString();
      await sendOrQueueGps(
        session.id,
        loc.coords.latitude,
        loc.coords.longitude,
        ts
      );
    } catch (_) {
      // ignore location errors
    }
  }, [session, sendOrQueueGps]);

  const stopTracking = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
      console.log('🛑 GPS watchPosition stopped');
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('🛑 GPS interval tracking stopped');
    }
    if (adaptiveIntervalRef.current) {
      clearInterval(adaptiveIntervalRef.current);
      adaptiveIntervalRef.current = null;
      console.log('🛑 Adaptive GPS tracking stopped');
    }
    console.log('⏹️ All GPS tracking stopped');
  }, []);

  const startContinuousTracking = useCallback(async () => {
    if (!session?.is_active) {
      console.log('⚠️ Cannot start tracking: No active session');
      return;
    }

    // Clear any existing tracking first
    stopTracking();

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('❌ Location permission denied');
        Alert.alert('Location Required', 'Please enable location access to track your patrol route.');
        return;
      }

      console.log('🚀 Starting adaptive GPS tracking for session:', session.id);

      // Get initial position
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      await sendOrQueueGps(
        session.id,
        initialLocation.coords.latitude,
        initialLocation.coords.longitude,
        new Date().toISOString()
      );

      // Start adaptive tracking
      const startAdaptiveTracking = (speed: number = 0) => {
        const adaptiveInterval = getAdaptiveInterval(speed);
        
        console.log('⚡ Adaptive GPS Interval:', {
          speed: speed,
          interval: adaptiveInterval,
          reason: speed === 0 ? 'Stationary' : speed < 2 ? 'Walking' : speed < 8 ? 'Slow vehicle' : 'Fast vehicle'
        });

        // Clear existing adaptive interval
        if (adaptiveIntervalRef.current) {
          clearInterval(adaptiveIntervalRef.current);
          adaptiveIntervalRef.current = null;
        }

        // Set new adaptive interval
        adaptiveIntervalRef.current = setInterval(async () => {
          if (!session?.is_active) {
            console.log('⏹️ Session no longer active, stopping adaptive tracking');
            stopTracking();
            return;
          }

          try {
            const currentLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            const currentSpeed = currentLocation.coords.speed || 0;
            
            await sendOrQueueGps(
              session.id,
              currentLocation.coords.latitude,
              currentLocation.coords.longitude,
              new Date().toISOString()
            );
            
            console.log('🔄 Adaptive GPS update:', {
              speed: currentSpeed,
              interval: adaptiveInterval
            });

            // Adjust interval if speed changed significantly
            const newInterval = getAdaptiveInterval(currentSpeed);
            if (Math.abs(newInterval - adaptiveInterval) > 5000) {
              console.log('🔄 Speed changed significantly, adjusting interval');
              startAdaptiveTracking(currentSpeed);
            }
          } catch (error) {
            console.error('❌ Adaptive GPS update failed:', error);
            // Don't stop tracking on single failure, just log it
          }
        }, adaptiveInterval);
      };

      // Start with watchPosition for movement detection
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: MIN_DISTANCE_METERS,
        },
        async (location) => {
          if (!session?.is_active) return;
          
          const speed = location.coords.speed || 0;
          const ts = new Date().toISOString();
          
          console.log('📍 GPS Movement Detected:', {
            sessionId: session.id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: speed,
            timestamp: ts
          });
          
          await sendOrQueueGps(
            session.id,
            location.coords.latitude,
            location.coords.longitude,
            ts
          );

          // Start/adjust adaptive tracking based on movement
          startAdaptiveTracking(speed);
        }
      );
      
      // Start initial adaptive tracking
      startAdaptiveTracking(initialLocation.coords.speed || 0);
      
      console.log('✅ Adaptive GPS tracking started successfully');
    } catch (error) {
      console.error('❌ Failed to start GPS tracking:', error);
      
      // Fallback to simple interval tracking
      console.log('🔄 Falling back to simple interval tracking');
      try {
        await captureAndSendGps();
        intervalRef.current = setInterval(captureAndSendGps, 30000); // Conservative 30s fallback
        console.log('✅ Fallback tracking started');
      } catch (fallbackError) {
        console.error('❌ Even fallback tracking failed:', fallbackError);
        Alert.alert('GPS Error', 'Unable to start GPS tracking. Please check your location settings.');
      }
    }
  }, [session, captureAndSendGps, sendOrQueueGps, stopTracking]);

  useEffect(() => {
    if (!session?.is_active) {
      stopTracking();
      return;
    }
    startContinuousTracking();
    return () => stopTracking();
  }, [session?.id, session?.is_active, startContinuousTracking, stopTracking]);

  useEffect(() => {
    (async () => {
      const q = await getQueue();
      setQueuedCount(q.length);
    })();
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        flushQueue().then(({ sent }) => {
          if (sent > 0) fetchSessions();
          getQueue().then((q) => setQueuedCount(q.length));
        });
      }
    });
    return () => sub.remove();
  }, [fetchSessions]);

  const handleStartSession = async () => {
    if (vehicles.length === 0) {
      Alert.alert('No vehicles', 'No vehicles are assigned to your branch. Contact your branch admin.');
      return;
    }
    if (vehicles.length > 1 && selectedVehicleId == null) {
      Alert.alert('Select vehicle', 'Choose which vehicle you are using before starting the session.');
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location required', 'Allow location access to record patrol GPS.');
      return;
    }
    const vehicleId = vehicles.length === 1 ? vehicles[0].id : selectedVehicleId ?? null;
    setActionLoading(true);
    try {
      console.log('🚗 Starting session with vehicle:', vehicleId);
      const newSession = await ronda.sessions.start(vehicleId ?? undefined);
      setSession(newSession);
      console.log('✅ Session started successfully:', newSession.id);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (e as Error)?.message
        || 'Failed to start session';
      console.error('❌ Failed to start session:', e);
      Alert.alert('Error', String(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!session?.id) return;
    setActionLoading(true);
    try {
      console.log('🛑 Stopping session:', session.id);
      await ronda.sessions.stop(session.id);
      setSession(null);
      setLastGpsTime(null);
      console.log('✅ Session stopped successfully');
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to stop session';
      console.error('❌ Failed to stop session:', e);
      Alert.alert('Error', String(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/login');
      } },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>R.O.N.D.A. Driver</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Driver</Text>
        <Text style={styles.value}>{user?.username ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Branch</Text>
        <Text style={styles.value}>{session?.branch_name ?? user?.branchName ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Vehicle</Text>
        <Text style={styles.value}>{session?.vehicle_plate ?? '—'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.sessionCard}>
        <Text style={styles.sessionStatus}>
          Session: {session?.is_active ? 'Active' : 'Inactive'}
        </Text>
        {session?.is_active && (
          <Text style={styles.gpsInfo}>
            Continuous GPS tracking. Last: {lastGpsTime ? new Date(lastGpsTime).toLocaleTimeString() : '—'}
          </Text>
        )}
        {queuedCount > 0 && (
          <Text style={styles.queued}>Queued to sync: {queuedCount} point(s)</Text>
        )}
      </View>

      {!session?.is_active && vehicles.length > 0 && (
        <View style={styles.vehiclePicker}>
          <Text style={styles.vehiclePickerLabel}>Choose vehicle for this session</Text>
          {vehicles.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[
                styles.vehicleOption,
                selectedVehicleId === v.id && styles.vehicleOptionSelected,
              ]}
              onPress={() => setSelectedVehicleId(v.id)}
            >
              <Text style={styles.vehicleOptionText}>
                {v.plate_number} {v.name ? `— ${v.name}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!session?.is_active && vehicles.length === 0 && !loading && (
        <Text style={styles.noVehicles}>
          No vehicles assigned to your branch. Ask your branch admin to register a vehicle.
        </Text>
      )}

      <View style={styles.actions}>
        {!session?.is_active ? (
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonStart,
              (actionLoading || (vehicles.length > 1 && selectedVehicleId == null)) && styles.buttonDisabled,
            ]}
            onPress={handleStartSession}
            disabled={actionLoading || (vehicles.length > 1 && selectedVehicleId == null)}
          >
            <Text style={styles.buttonText}>Start Session</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.buttonStop, actionLoading && styles.buttonDisabled]}
            onPress={handleStopSession}
            disabled={actionLoading}
          >
            <Text style={styles.buttonText}>Stop Session</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1c2e' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1c2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  logoutBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  logoutText: { color: '#7eb8ff', fontSize: 15 },

  card: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  value: { fontSize: 16, color: '#fff', fontWeight: '500' },

  sessionCard: {
    backgroundColor: '#1a3452',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  sessionStatus: { fontSize: 16, color: '#fff', fontWeight: '600' },
  gpsInfo: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  queued: { fontSize: 13, color: '#ffc107', marginTop: 4 },

  error: { color: '#f88', marginBottom: 12, fontSize: 14 },

  vehiclePicker: { marginBottom: 16 },
  vehiclePickerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  vehicleOption: {
    backgroundColor: '#1a3452',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleOptionSelected: { borderColor: '#2e7d32' },
  vehicleOptionText: { fontSize: 15, color: '#fff' },
  noVehicles: { color: '#ffc107', marginBottom: 16, fontSize: 14 },

  actions: { gap: 12 },
  button: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonStart: { backgroundColor: '#2e7d32' },
  buttonStop: { backgroundColor: '#c62828' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
