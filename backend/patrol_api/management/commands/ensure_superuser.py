import os

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = 'Create a superuser from env vars if it does not already exist.'

    def handle(self, *args, **options):
        username = os.environ.get('DJANGO_SUPERUSER_USERNAME')
        email = os.environ.get('DJANGO_SUPERUSER_EMAIL', '')
        password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')

        if not username or not password:
            self.stdout.write('DJANGO_SUPERUSER_USERNAME or DJANGO_SUPERUSER_PASSWORD not set; skipping superuser creation.')
            return

        User = get_user_model()
        user, created = User.objects.get_or_create(username=username, defaults={'email': email})

        changed = False

        if created:
            user.is_staff = True
            user.is_superuser = True
            if hasattr(user, 'role'):
                user.role = 'SUPER_ADMIN'
            user.set_password(password)
            user.save()
            self.stdout.write(f'Superuser {username} created.')
            return

        if not user.is_staff:
            user.is_staff = True
            changed = True

        if not user.is_superuser:
            user.is_superuser = True
            changed = True

        if hasattr(user, 'role') and user.role != 'SUPER_ADMIN':
            user.role = 'SUPER_ADMIN'
            changed = True

        if password and not user.check_password(password):
            user.set_password(password)
            changed = True

        if changed:
            user.save()
            self.stdout.write(f'Superuser {username} already existed; updated flags/password.')
        else:
            self.stdout.write(f'Superuser {username} already exists; no changes.')
