from patrol_api.models import User

users = User.objects.all()
print('Available User Accounts:')
print('=' * 50)
for u in users:
    branch_name = u.branch.name if u.branch else 'None'
    print(f'Username: {u.username} | Role: {u.role} | Branch: {branch_name}')
print('=' * 50)
print('Default password for existing users: password123')
print('Super Admin (admin) password: admin123')
