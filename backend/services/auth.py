"""Authentication service — password hashing and JWT token management."""

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError


class AuthService:
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expire = timedelta(minutes=15)
        self.refresh_token_expire = timedelta(days=7)

    def hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    def verify_password(self, password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

    def create_access_token(self, user_id: str, role: str) -> str:
        expire = datetime.now(timezone.utc) + self.access_token_expire
        payload = {"sub": user_id, "role": role, "type": "access", "exp": expire}
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def create_refresh_token(self, user_id: str) -> str:
        expire = datetime.now(timezone.utc) + self.refresh_token_expire
        payload = {"sub": user_id, "type": "refresh", "exp": expire}
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def decode_token(self, token: str) -> dict:
        return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
