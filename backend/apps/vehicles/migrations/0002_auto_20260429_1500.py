# Auto migration to handle missing table on Render

from django.db import migrations, models, connection


def forwards_func(apps, schema_editor):
    # Check if VehiclePhotoSubmission table exists
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name='vehicles_vehiclephotosubmission'
        """)
        if cursor.fetchone():
            return  # Table already exists, skip
    
    # Create table only if it doesn't exist
    schema_editor.execute("""
        CREATE TABLE vehicles_vehiclephotosubmission (
            id SERIAL PRIMARY KEY,
            photo_type VARCHAR(20) NOT NULL,
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
            photo_count INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'pending',
            shift_id INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            branch_id INTEGER REFERENCES patrol_api_branch(id) ON DELETE CASCADE,
            driver_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
            vehicle_id INTEGER REFERENCES patrol_api_vehicle(id) ON DELETE CASCADE
        )
    """)


def reverse_func(apps, schema_editor):
    # We don't want to drop the table on reverse
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('vehicles', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards_func, reverse_func),
    ]
