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
        else:
            serializer.save()

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
        user = request.user
        if user.role == 'SUPER_ADMIN':
            sessions = DriverSession.objects.filter(is_active=True).select_related('driver', 'vehicle', 'branch')
        elif user.role == 'BRANCH_ADMIN' and user.branch_id:
            sessions = DriverSession.objects.filter(is_active=True, branch_id=user.branch_id).select_related('driver', 'vehicle', 'branch')
        else:
            sessions = DriverSession.objects.none()

        # Return last 10 minutes of GPS points per session for live tracking
        ten_minutes_ago = timezone.now() - timedelta(minutes=10)
        results = []
        for s in sessions:
            recent_gps = GPSLog.objects.filter(
                session=s,
                timestamp__gte=ten_minutes_ago
            ).order_by('timestamp')
            
            gps_points = [
                {
                    'latitude': float(g.latitude),
                    'longitude': float(g.longitude),
                    'timestamp': g.timestamp.isoformat()
                }
                for g in recent_gps
            ]
            
            # Also include the latest point for compatibility
            last_gps = recent_gps.last()
            results.append({
                'session_id': s.id,
                'driver': s.driver.username,
                'vehicle': s.vehicle.plate_number,
                'branch': s.branch.code,
                'latitude': float(last_gps.latitude) if last_gps else None,
                'longitude': float(last_gps.longitude) if last_gps else None,
                'timestamp': last_gps.timestamp.isoformat() if last_gps else None,
                'recent_points': gps_points,  # New field with trail
            })
        return Response(results)


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
