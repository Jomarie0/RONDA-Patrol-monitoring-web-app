from patrol_api.models import DriverSession, GPSLog

print('Active Sessions:')
sessions = DriverSession.objects.filter(is_active=True)
for s in sessions:
    gps_count = GPSLog.objects.filter(session=s).count()
    last_gps = GPSLog.objects.filter(session=s).order_by('-timestamp').first()
    print(f'Session {s.id}: Driver {s.driver.username}, Vehicle {s.vehicle.plate_number}, Branch {s.branch.code}')
    print(f'  GPS logs: {gps_count}, Last GPS: {last_gps.timestamp if last_gps else "None"}')
    print()

print('Live Locations API Response:')
print('Sessions with GPS data:')
for s in sessions:
    last_gps = GPSLog.objects.filter(session=s).order_by('-timestamp').first()
    if last_gps:
        print(f'  Session {s.id}: Has GPS ({last_gps.latitude}, {last_gps.longitude})')
    else:
        print(f'  Session {s.id}: No GPS data')
