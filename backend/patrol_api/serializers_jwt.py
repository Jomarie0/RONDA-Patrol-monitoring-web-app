"""Custom JWT claims: role and branch_id for frontend."""
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class RondaTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role'] = user.role
        token['branch_id'] = user.branch_id
        token['user_id'] = user.id
        return token
