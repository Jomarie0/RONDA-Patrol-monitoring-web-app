# Add submission_id field to VehiclePhoto model

from django.db import migrations, models, connection


def forwards_func(apps, schema_editor):
    # Check if column already exists
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='patrol_api_vehiclephoto' 
            AND column_name='submission_id'
        """)
        if cursor.fetchone():
            return  # Column already exists, skip
    
    # Add column only if it doesn't exist
    schema_editor.execute(
        "ALTER TABLE patrol_api_vehiclephoto "
        "ADD COLUMN submission_id INTEGER"
    )


def reverse_func(apps, schema_editor):
    # We don't want to drop the column on reverse
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('patrol_api', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards_func, reverse_func),
    ]
