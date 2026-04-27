/**
 * R.O.N.D.A. Driver App — Background Task Manager
 * Keeps app aware of session state even when backgrounded
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, AppStateStatic } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { ronda } from './api';
import { pushToQueue } from './gps-queue';

let backgroundInterval: any = null;
let isAppInForeground = true;

const LOCATION_TASK_NAME = 'background-location-task';

// Define the background location task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('❌ Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    for (const location of locations) {
      try {
        // Get session info from storage
        const sessionId = await AsyncStorage.getItem('activeSessionId');
        if (!sessionId) continue;

        const latitude = location.coords.latitude;
        const longitude = location.coords.longitude;
        const accuracy = location.coords.accuracy;
        const speed = location.coords.speed;
        const altitude = location.coords.altitude;
        const timestamp = new Date().toISOString();

        // Push to queue for later sending
        await pushToQueue({
          sessionId: parseInt(sessionId),
          latitude,
          longitude,
          timestamp,
          accuracy,
          speed,
          altitude,
          isValid: true, // Assume valid in background
          rejectionReason: undefined,
          accuracyScore: 1.0
        });

        console.log('📍 Background GPS:', { lat: latitude.toFixed(6), lon: longitude.toFixed(6) });
      } catch (err) {
        console.error('❌ Error processing background location:', err);
      }
    }
  }
});

export async function startBackgroundLocationTracking(sessionId: number): Promise<void> {
  try {
    await AsyncStorage.setItem('activeSessionId', sessionId.toString());
    
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('⚠️ Background location permission not granted');
      return;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000, // 10 seconds
      distanceInterval: 10, // 10 meters
      showsBackgroundLocationIndicator: true,
    });

    console.log('🚀 Background location tracking started');
  } catch (error) {
    console.error('❌ Failed to start background location tracking:', error);
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    await AsyncStorage.removeItem('activeSessionId');
    console.log('⏹️ Background location tracking stopped');
  } catch (error) {
    console.error('❌ Failed to stop background location tracking:', error);
  }
}

export async function initializeBackgroundTracking(): Promise<void> {
  try {
    // Start monitoring app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Store subscription for cleanup
    (global as any).appStateSubscription = subscription;
    
    // Start periodic session check
    startSessionCheck();
    
    console.log(' Background tracking initialized');
  } catch (error) {
    console.error('❌ Failed to initialize background tracking:', error);
  }
}

export async function cleanupBackgroundTracking(): Promise<void> {
  try {
    // Clear interval
    if (backgroundInterval) {
      clearInterval(backgroundInterval);
      backgroundInterval = null;
    }
    
    // Remove app state listener
    const subscription = (global as any).appStateSubscription;
    if (subscription && subscription.remove) {
      subscription.remove();
    }
    
    console.log(' Background tracking cleaned up');
  } catch (error) {
    console.error('❌ Failed to cleanup background tracking:', error);
  }
}

function handleAppStateChange(nextAppState: AppStateStatus): void {
  const wasInForeground = isAppInForeground;
  isAppInForeground = nextAppState === 'active';
  
  console.log(`📱 App state: ${wasInForeground ? 'background' : 'foreground'} → ${isAppInForeground ? 'foreground' : 'background'}`);
  
  // When app comes to foreground, check session status
  if (!wasInForeground && isAppInForeground) {
    checkActiveSession();
  }
}

function startSessionCheck(): void {
  // Check session status every 30 seconds
  backgroundInterval = setInterval(() => {
    if (isAppInForeground) {
      checkActiveSession();
    }
  }, 30000);
}

async function checkActiveSession(): Promise<void> {
  try {
    const userId = await AsyncStorage.getItem('currentUserId');
    if (!userId) return;
    
    const sessions = await ronda.sessions.list();
    const activeSession = sessions.find((s: any) => s.driver_id === parseInt(userId) && s.is_active);
    
    if (activeSession) {
      console.log(' Active session confirmed for user:', userId);
    } else {
      console.log('⚠️ No active session found for user:', userId);
    }
  } catch (error) {
    console.error('❌ Error checking active session:', error);
  }
}

export async function startBackgroundSessionTracking(userId: number): Promise<void> {
  try {
    await AsyncStorage.setItem('currentUserId', userId.toString());
    console.log('📍 Background session tracking started for user:', userId);
  } catch (error) {
    console.error('❌ Failed to start background session tracking:', error);
  }
}

export async function stopBackgroundSessionTracking(): Promise<void> {
  try {
    await AsyncStorage.removeItem('currentUserId');
    console.log('⏹️ Background session tracking stopped');
  } catch (error) {
    console.error('❌ Failed to stop background session tracking:', error);
  }
}
