"""
R.O.N.D.A. — Django admin. Branch Admin can only manage branch and drivers (enforced in API; admin is for Super Admin).
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Branch, User, Vehicle, DriverSession, GPSLog, IncidentReport


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'is_main', 'created_at']
    list_filter = ['is_main']
    search_fields = ['name', 'code']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'role', 'branch', 'is_active', 'date_joined']
    list_filter = ['role', 'is_active', 'branch']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering = ['username']
    filter_horizontal = []
    fieldsets = BaseUserAdmin.fieldsets + (
        ('R.O.N.D.A.', {'fields': ('role', 'branch')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('R.O.N.D.A.', {'fields': ('role', 'branch')}),
    )


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ['plate_number', 'branch', 'name', 'created_at']
    list_filter = ['branch']
    search_fields = ['plate_number', 'name']


@admin.register(DriverSession)
class DriverSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'driver', 'vehicle', 'branch', 'start_time', 'end_time', 'is_active']
    list_filter = ['is_active', 'branch']
    search_fields = ['driver__username']
    raw_id_fields = ['driver', 'vehicle', 'branch']


@admin.register(GPSLog)
class GPSLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'latitude', 'longitude', 'timestamp']
    list_filter = ['session__branch']
    raw_id_fields = ['session']


@admin.register(IncidentReport)
class IncidentReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'description', 'created_at']
    list_filter = ['session__branch']
    raw_id_fields = ['session']
