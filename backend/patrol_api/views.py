"""
R.O.N.D.A. — API ViewSets.
- Driver: JWT login, start/stop session (single active), GPS only when session active.
- Branch Admin: view sessions and live vehicle locations for their branch.
- Super Admin: full access.
"""

from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Branch, User, Vehicle, DriverSession, GPSLog, IncidentReport
from .serializers import (
    BranchSerializer,
    UserListSerializer,
    UserCreateUpdateSerializer,
    VehicleSerializer,
    DriverSessionSerializer,
    DriverSessionStartSerializer,
    GPSLogSerializer,
    IncidentReportSerializer,
)
from .permissions import (
    IsSuperAdmin,
    IsBranchAdmin,
    IsDriver,
    BranchScopedPermission,
    UserManagementPermission,
)


# ---------- Branch ----------
class BranchViewSet(viewsets.ModelViewSet):
    """
    Branch management.
    - Super Admin: can list/create/update all branches.
    - Branch Admin: can only see their own branch (read-only).
    """
    serializer_class = BranchSerializer
    permission_classes = [IsBranchAdmin]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return Branch.objects.all()
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return Branch.objects.filter(pk=user.branch_id)
        return Branch.objects.none()

    def perform_create(self, serializer):
        # Only Super Admin can create branches
        if not self.request.user.is_super_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin can create branches.')
        serializer.save()

    def perform_update(self, serializer):
        # Only Super Admin can update branches
        if not self.request.user.is_super_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin can update branches.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Override destroy to handle related data safely"""
        try:
            branch = self.get_object()
            
            # Only Super Admin can delete branches
            if not request.user.is_super_admin:
                return Response(
                    {'detail': 'Only Super Admin can delete branches.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Check if branch has active sessions
            active_sessions = DriverSession.objects.filter(branch=branch, is_active=True)
            if active_sessions.exists():
                return Response(
                    {'detail': 'Cannot delete branch with active patrol sessions. Stop all sessions first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if branch has assigned users
            users_count = User.objects.filter(branch=branch).count()
            if users_count > 0:
                return Response(
                    {'detail': f'Cannot delete branch with {users_count} assigned users. Reassign or delete users first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if branch has vehicles
            vehicles_count = Vehicle.objects.filter(branch=branch).count()
            if vehicles_count > 0:
                return Response(
                    {'detail': f'Cannot delete branch with {vehicles_count} registered vehicles. Delete vehicles first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if branch has historical data
            session_count = DriverSession.objects.filter(branch=branch).count()
            
            if session_count > 0:
                print(f"Deleting branch {branch.name} ({branch.code}) with {session_count} historical sessions")
            
            # Proceed with deletion
            self.perform_destroy(branch)
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except Exception as e:
            print(f"Error deleting branch: {e}")
            return Response(
                {'detail': f'Failed to delete branch: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ---------- User (admin can only give accounts for branch and drivers) ----------
class UserViewSet(viewsets.ModelViewSet):
    """
    User CRUD. Super Admin: any role/branch. Branch Admin: only DRIVER for their branch.
    """
    permission_classes = [UserManagementPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return User.objects.all().select_related('branch')
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return User.objects.filter(branch_id=user.branch_id).select_related('branch')
        return User.objects.none()

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UserCreateUpdateSerializer
        return UserListSerializer

    def destroy(self, request, *args, **kwargs):
        """Override destroy to handle related data safely"""
        try:
            user = self.get_object()
            
            # Check if user has active sessions (prevent deletion of active users)
            active_sessions = DriverSession.objects.filter(driver=user, is_active=True)
            if active_sessions.exists():
                return Response(
                    {'detail': 'Cannot delete user with active patrol sessions. Stop all sessions first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if user is a branch admin with drivers (prevent deletion of responsible admins)
            if user.role == 'BRANCH_ADMIN':
                drivers_in_branch = User.objects.filter(branch=user.branch, role='DRIVER').exclude(id=user.id)
                if drivers_in_branch.exists():
                    return Response(
                        {'detail': 'Cannot delete branch admin with assigned drivers. Reassign drivers first.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Count historical data for logging
            session_count = DriverSession.objects.filter(driver=user).count()
            gps_count = GPSLog.objects.filter(session__driver=user).count()
            
            if session_count > 0:
                print(f"Deleting user {user.username} with {session_count} historical sessions and {gps_count} GPS records")
                print(f"WARNING: Sessions will be preserved but driver field will be set to NULL")
            
            # Update sessions to set driver to NULL before deleting user
            DriverSession.objects.filter(driver=user).update(driver=None)
            
            # Proceed with user deletion
            self.perform_destroy(user)
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except Exception as e:
            print(f"Error deleting user: {e}")
            return Response(
                {'detail': f'Failed to delete user: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ---------- Vehicle ----------
class VehicleViewSet(viewsets.ModelViewSet):
    """
    Vehicles registered to a branch. Drivers can list vehicles for their branch (to choose when starting a session).
    Super Admin / Branch Admin can create and manage vehicles (Branch Admin only for their branch).
    """
    serializer_class = VehicleSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return Vehicle.objects.all().select_related('branch')
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return Vehicle.objects.filter(branch_id=user.branch_id).select_related('branch')
        if user.role == 'DRIVER' and user.branch_id:
            return Vehicle.objects.filter(branch_id=user.branch_id).select_related('branch')
        return Vehicle.objects.none()

    def perform_create(self, serializer):
        if self.request.user.role == 'DRIVER':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin or Branch Admin can register vehicles.')
        user = self.request.user
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            serializer.save(branch_id=user.branch_id)

    def destroy(self, request, *args, **kwargs):
        """Override destroy to handle related data safely"""
        try:
            vehicle = self.get_object()
            
            # Check if vehicle has active sessions
            active_sessions = DriverSession.objects.filter(vehicle=vehicle, is_active=True)
            if active_sessions.exists():
                return Response(
                    {'detail': 'Cannot delete vehicle with active patrol sessions. Stop all sessions first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if vehicle has historical data
            session_count = DriverSession.objects.filter(vehicle=vehicle).count()
            
            if session_count > 0:
                print(f"Deleting vehicle {vehicle.plate_number} with {session_count} historical sessions")
            
            # Proceed with deletion
            self.perform_destroy(vehicle)
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except Exception as e:
            print(f"Error deleting vehicle: {e}")
            return Response(
                {'detail': f'Failed to delete vehicle: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_update(self, serializer):
        if self.request.user.role == 'DRIVER':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin or Branch Admin can update vehicles.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role == 'DRIVER':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Super Admin or Branch Admin can delete vehicles.')
        instance.delete()


# ---------- DriverSession ----------
class DriverSessionViewSet(viewsets.ModelViewSet):
    """
    Sessions: Driver can start (one active only) and stop own session.
    Branch Admin sees all sessions in their branch; Super Admin sees all.
    """
    serializer_class = DriverSessionSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'SUPER_ADMIN':
            return DriverSession.objects.all().select_related('driver', 'vehicle', 'branch')
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return DriverSession.objects.filter(branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
        if user.role == 'DRIVER':
            return DriverSession.objects.filter(driver_id=user.id).select_related('driver', 'vehicle', 'branch')
        return DriverSession.objects.none()

    def perform_create(self, serializer):
        # Only used for start; driver and branch set from request.user
        pass

    @action(detail=False, methods=['post'], url_path='start')
    def start_session(self, request):
        """
        Driver starts a session. Only one active session per driver.
        Expects optional vehicle_id; if driver's branch has one vehicle, use it.
        """
        if request.user.role != 'DRIVER':
            return Response({'detail': 'Only drivers can start a session.'}, status=status.HTTP_403_FORBIDDEN)
        driver = request.user
        if not driver.branch_id:
            return Response({'detail': 'Driver must be assigned to a branch.'}, status=status.HTTP_400_BAD_REQUEST)

        # Prevent multiple active sessions
        if DriverSession.objects.filter(driver=driver, is_active=True).exists():
            return Response(
                {'detail': 'You already have an active session. Stop it before starting a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = DriverSessionStartSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vehicle_id = ser.validated_data.get('vehicle_id')

        vehicle = None
        if vehicle_id:
            vehicle = Vehicle.objects.filter(pk=vehicle_id, branch_id=driver.branch_id).first()
            if not vehicle:
                return Response({'detail': 'Vehicle not found or not in your branch.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            vehicle = Vehicle.objects.filter(branch_id=driver.branch_id).first()
            if not vehicle:
                return Response({'detail': 'No vehicle assigned to your branch.'}, status=status.HTTP_400_BAD_REQUEST)

        session = DriverSession.objects.create(
            driver=driver,
            vehicle=vehicle,
            branch=driver.branch,
            start_time=timezone.now(),
            is_active=True,
        )
        return Response(DriverSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='stop')
    def stop_session(self, request, pk=None):
        """Driver stops their active session."""
        session = self.get_object()
        if request.user.role != 'DRIVER' or session.driver_id != request.user.id:
            return Response({'detail': 'You can only stop your own session.'}, status=status.HTTP_403_FORBIDDEN)
        if not session.is_active:
            return Response({'detail': 'Session is already stopped.'}, status=status.HTTP_400_BAD_REQUEST)
        session.is_active = False
        session.end_time = timezone.now()
        session.save()
        return Response(DriverSessionSerializer(session).data)


# ---------- Live locations (last GPS per active session) ----------
class LiveLocationsView(APIView):
    """
    GET: Branch Admin sees live vehicle locations for their branch (last GPS per active session).
    Super Admin sees all branches.
    """
    permission_classes = [IsBranchAdmin]

    def get(self, request):
        try:
            user = request.user
            if user.role == 'SUPER_ADMIN':
                sessions = DriverSession.objects.filter(is_active=True).select_related('driver', 'vehicle', 'branch')
            elif user.role == 'BRANCH_ADMIN' and user.branch_id:
                sessions = DriverSession.objects.filter(is_active=True, branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
            else:
                sessions = DriverSession.objects.none()

            # Return last 3 minutes of GPS points per session for real-time tracking (reduced from 5 minutes)
            three_minutes_ago = timezone.now() - timedelta(minutes=3)
            results = []
            
            for s in sessions:
                try:
                    # Get all GPS points in the last 3 minutes, ordered by timestamp
                    recent_gps = GPSLog.objects.filter(
                        session=s,
                        timestamp__gte=three_minutes_ago
                    ).order_by('timestamp')  # Ensure chronological order
                    
                    # Validate GPS data and filter out invalid points
                    valid_gps_points = []
                    for g in recent_gps:
                        try:
                            lat = float(g.latitude)
                            lon = float(g.longitude)
                            
                            # Validate coordinates (Philippines bounds)
                            if not (4.0 <= lat <= 21.0 and 112.0 <= lon <= 131.0):
                                print(f"Invalid GPS coordinates for session {s.id}: {lat}, {lon}")
                                continue
                                
                            valid_gps_points.append({
                                'latitude': lat,
                                'longitude': lon,
                                'timestamp': g.timestamp.isoformat()
                            })
                        except (ValueError, TypeError) as e:
                            print(f"Invalid GPS data for session {s.id}: {e}")
                            continue
                    
                    # Get the latest GPS point for compatibility
                    last_gps = recent_gps.last() if recent_gps.exists() else None
                    
                    result = {
                        'session_id': s.id,
                        'driver': s.driver.username,
                        'vehicle': s.vehicle.plate_number,
                        'branch': s.branch.code,
                        'latitude': float(last_gps.latitude) if last_gps else None,
                        'longitude': float(last_gps.longitude) if last_gps else None,
                        'timestamp': last_gps.timestamp.isoformat() if last_gps else None,
                        'recent_points': valid_gps_points,  # All valid points in chronological order
                        'total_points': len(valid_gps_points),  # Total count for debugging
                    }
                    results.append(result)
                    
                except Exception as e:
                    print(f"Error processing session {s.id}: {e}")
                    # Add session with no GPS data rather than failing completely
                    results.append({
                        'session_id': s.id,
                        'driver': s.driver.username,
                        'vehicle': s.vehicle.plate_number,
                        'branch': s.branch.code,
                        'latitude': None,
                        'longitude': None,
                        'timestamp': None,
                        'recent_points': [],
                        'total_points': 0,
                    })
            
            return Response(results)
            
        except Exception as e:
            print(f"Critical error in LiveLocationsView: {e}")
            return Response(
                {'error': 'Failed to load live locations', 'detail': str(e)},
                status=500
            )


# ---------- GPSLog ----------
class GPSLogViewSet(viewsets.ModelViewSet):
    """
    GPS logs. Driver can create only for their active session.
    Branch Admin / Super Admin can list/filter by session (branch-scoped).
    """
    serializer_class = GPSLogSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        qs = GPSLog.objects.all().select_related('session', 'session__driver', 'session__branch')
        if user.role == 'SUPER_ADMIN':
            return qs
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return qs.filter(session__branch_id=user.branch_id)
        if user.role == 'DRIVER':
            return qs.filter(session__driver_id=user.id)
        return qs.none()

    def perform_create(self, serializer):
        # Ensure driver can only create GPS logs for their own active session
        if self.request.user.role == 'DRIVER':
            session = serializer.validated_data.get('session')
            if session.driver_id != self.request.user.id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('You can only add GPS logs to your own session.')
            if not session.is_active:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('GPS can only be recorded for an active session.')
        serializer.save()


# ---------- IncidentReport ----------
class IncidentReportViewSet(viewsets.ModelViewSet):
    """Incident reports. Driver can create for own session; admins see branch-scoped."""
    serializer_class = IncidentReportSerializer
    permission_classes = [IsDriver, BranchScopedPermission]

    def get_queryset(self):
        user = self.request.user
        qs = IncidentReport.objects.all().select_related('session', 'session__driver', 'session__branch')
        if user.role == 'SUPER_ADMIN':
            return qs
        if user.role == 'BRANCH_ADMIN' and user.branch_id:
            return qs.filter(session__branch_id=user.branch_id)
        if user.role == 'DRIVER':
            return qs.filter(session__driver_id=user.id)
        return qs.none()
