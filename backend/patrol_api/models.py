"""
R.O.N.D.A. — Mobile-Based GPS Patrol Monitoring and Driver Session Management.
Core models: Branch, User (role + branch), Vehicle, DriverSession, GPSLog, IncidentReport.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser


class Role(models.TextChoices):
    """Role-based access: Super Admin (all branches), Branch Admin (own branch), Driver (own session)."""
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
    BRANCH_ADMIN = 'BRANCH_ADMIN', 'Branch Admin'
    DRIVER = 'DRIVER', 'Driver'


class Branch(models.Model):
    """
    Branch (e.g. 41 branches). One Main Branch for Super Admin; each branch has one Branch Admin
    and multiple drivers; one patrol vehicle per branch (device fixed per vehicle).
    """
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, unique=True, help_text='Short branch identifier')
    is_main = models.BooleanField(default=False, help_text='True only for the main branch (Super Admin)')
    address = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code})"


class User(AbstractUser):
    """
    Custom user: role (SUPER_ADMIN, BRANCH_ADMIN, DRIVER) and optional branch.
    SUPER_ADMIN: branch null, access all. BRANCH_ADMIN/DRIVER: branch required.
    """
    role = models.CharField(max_length=20, choices=Role.choices)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='users',
        help_text='Required for BRANCH_ADMIN and DRIVER; null for SUPER_ADMIN',
    )

    class Meta:
        ordering = ['username']

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_super_admin(self):
        return self.role == Role.SUPER_ADMIN

    @property
    def is_branch_admin(self):
        return self.role == Role.BRANCH_ADMIN

    @property
    def is_driver(self):
        return self.role == Role.DRIVER


class Vehicle(models.Model):
    """Patrol vehicles registered to a branch; driver chooses one when starting a session."""
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='vehicles',
    )
    plate_number = models.CharField(max_length=32)
    name = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['branch__name']

    def __str__(self):
        return f"{self.plate_number} ({self.branch.code})"


class DriverSession(models.Model):
    """
    Driver session: one driver, one vehicle, one branch. Only one active session per driver.
    """
    driver = models.ForeignKey(User, on_delete=models.PROTECT, related_name='sessions')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='sessions')
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='sessions')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-start_time']

    def __str__(self):
        return f"Session {self.id} — {self.driver.username} ({self.branch.code})"


class GPSLog(models.Model):
    """GPS log tied to an active session; recorded every ~60 seconds."""
    session = models.ForeignKey(DriverSession, on_delete=models.CASCADE, related_name='gps_logs')
    latitude = models.DecimalField(max_digits=11, decimal_places=8)
    longitude = models.DecimalField(max_digits=11, decimal_places=8)
    timestamp = models.DateTimeField()

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"GPS {self.session_id} @ {self.timestamp}"


class IncidentReport(models.Model):
    """Incident report during a session (description, optional image and location)."""
    session = models.ForeignKey(DriverSession, on_delete=models.CASCADE, related_name='incident_reports')
    description = models.TextField()
    image = models.ImageField(upload_to='incidents/%Y/%m/%d/', blank=True, null=True)
    latitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Incident {self.id} — Session {self.session_id}"
