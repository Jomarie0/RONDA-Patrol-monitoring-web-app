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

const GPS_INTERVAL_MS = 5000; // 5 seconds for continuous tracking
const MIN_DISTANCE_METERS = 5; // Minimum movement to trigger update

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
      } catch {
        await pushToQueue({ sessionId, latitude: lat, longitude: lon, timestamp });
        const { getQueue } = await import('@/lib/gps-queue');
        const q = await getQueue();
        setQueuedCount(q.length);
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

  const startContinuousTracking = useCallback(async () => {
    if (!session?.is_active) return;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    try {
      // Start with current position
      await captureAndSendGps();

      // Then start continuous tracking
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: GPS_INTERVAL_MS,
          distanceInterval: MIN_DISTANCE_METERS,
        },
        async (location) => {
          if (!session?.is_active) return;
          const ts = new Date().toISOString();
          await sendOrQueueGps(
            session.id,
            location.coords.latitude,
            location.coords.longitude,
            ts
          );
        }
      );
    } catch (error) {
      console.error('Failed to start GPS tracking:', error);
      // Fallback to interval-based tracking
      intervalRef.current = setInterval(captureAndSendGps, GPS_INTERVAL_MS);
    }
  }, [session, captureAndSendGps, sendOrQueueGps]);

  const stopTracking = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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
      const newSession = await ronda.sessions.start(vehicleId ?? undefined);
      setSession(newSession);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (e as Error)?.message
        || 'Failed to start session';
      Alert.alert('Error', String(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!session?.id) return;
    setActionLoading(true);
    try {
      await ronda.sessions.stop(session.id);
      setSession(null);
      setLastGpsTime(null);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to stop session';
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
