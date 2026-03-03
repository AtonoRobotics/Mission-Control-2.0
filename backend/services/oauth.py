"""OAuth2 providers — Google and GitHub."""

from urllib.parse import urlencode

import httpx


class OAuthProvider:
    """Base class for OAuth2 providers."""

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    def get_authorization_url(self, state: str) -> str:
        raise NotImplementedError

    async def exchange_code(self, code: str) -> dict:
        raise NotImplementedError


class GoogleOAuthProvider(OAuthProvider):
    AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

    def get_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient() as client:
            # Exchange code for token
            token_resp = await client.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri,
            })
            token_resp.raise_for_status()
            tokens = token_resp.json()

            # Fetch user info
            userinfo_resp = await client.get(
                self.USERINFO_URL,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            userinfo_resp.raise_for_status()
            userinfo = userinfo_resp.json()

        return {
            "email": userinfo["email"],
            "name": userinfo.get("name", userinfo["email"]),
            "avatar_url": userinfo.get("picture"),
            "provider": "google",
            "provider_id": userinfo["sub"],
        }


class GitHubOAuthProvider(OAuthProvider):
    AUTH_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    USER_URL = "https://api.github.com/user"
    EMAILS_URL = "https://api.github.com/user/emails"

    def get_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "user:email read:user",
            "state": state,
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient() as client:
            # Exchange code for token
            token_resp = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                },
                headers={"Accept": "application/json"},
            )
            token_resp.raise_for_status()
            access_token = token_resp.json()["access_token"]

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            }

            # Fetch user profile
            user_resp = await client.get(self.USER_URL, headers=headers)
            user_resp.raise_for_status()
            user = user_resp.json()

            # Fetch primary email
            email_resp = await client.get(self.EMAILS_URL, headers=headers)
            email_resp.raise_for_status()
            emails = email_resp.json()
            primary_email = next(
                (e["email"] for e in emails if e["primary"] and e["verified"]),
                user.get("email"),
            )

        return {
            "email": primary_email,
            "name": user.get("name") or user["login"],
            "avatar_url": user.get("avatar_url"),
            "provider": "github",
            "provider_id": str(user["id"]),
        }
