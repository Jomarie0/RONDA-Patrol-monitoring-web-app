# Generated migration for updating DriverSession foreign key constraint

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('patrol_api', '0004_vehicle_multiple_per_branch'),
    ]

    operations = [
        migrations.AlterField(
            model_name='driversession',
            name='driver',
            field=models.ForeignKey(
                null=True, 
                on_delete=django.db.models.deletion.SET_NULL, 
                related_name='sessions', 
                to='patrol_api.user'
            ),
        ),
    ]
