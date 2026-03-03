"""
Cloud Storage Service — S3/MinIO wrapper.
Presigned URLs, list, upload, delete. Works with AWS S3 and MinIO.
"""

import structlog
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from core.settings import get_settings

logger = structlog.get_logger(__name__)


class CloudStorage:
    """Thin wrapper around boto3 S3 client."""

    def __init__(self):
        settings = get_settings()
        kwargs: dict = {
            "aws_access_key_id": settings.MC_S3_ACCESS_KEY or None,
            "aws_secret_access_key": settings.MC_S3_SECRET_KEY or None,
            "region_name": settings.MC_S3_REGION,
            "config": BotoConfig(signature_version="s3v4"),
        }
        if settings.MC_S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.MC_S3_ENDPOINT_URL

        self._client = boto3.client("s3", **kwargs)
        self.bucket = settings.MC_S3_BUCKET
        self.presign_expire = settings.MC_S3_PRESIGN_EXPIRE

    # -- Presigned URLs --------------------------------------------------------

    def presign_upload(self, key: str, content_type: str = "application/octet-stream") -> str:
        """Generate a presigned PUT URL for direct upload."""
        return self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self.presign_expire,
        )

    def presign_download(self, key: str) -> str:
        """Generate a presigned GET URL for download."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.presign_expire,
        )

    # -- Upload / Download -----------------------------------------------------

    def upload_file(self, local_path: str, key: str, content_type: str = "application/octet-stream") -> bool:
        """Upload a local file to S3."""
        try:
            self._client.upload_file(
                local_path, self.bucket, key,
                ExtraArgs={"ContentType": content_type},
            )
            logger.info("s3_upload_complete", key=key)
            return True
        except ClientError as e:
            logger.error("s3_upload_failed", key=key, error=str(e))
            return False

    # -- List ------------------------------------------------------------------

    def list_objects(self, prefix: str = "", max_keys: int = 200) -> list[dict]:
        """List objects under a prefix. Returns [{key, size, last_modified}]."""
        try:
            resp = self._client.list_objects_v2(
                Bucket=self.bucket, Prefix=prefix, MaxKeys=max_keys,
            )
            return [
                {
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                }
                for obj in resp.get("Contents", [])
            ]
        except ClientError as e:
            logger.error("s3_list_failed", prefix=prefix, error=str(e))
            return []

    # -- Delete ----------------------------------------------------------------

    def delete_object(self, key: str) -> bool:
        """Delete a single object."""
        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
            logger.info("s3_delete_complete", key=key)
            return True
        except ClientError as e:
            logger.error("s3_delete_failed", key=key, error=str(e))
            return False

    # -- Head (check exists + metadata) ----------------------------------------

    def head_object(self, key: str) -> dict | None:
        """Get object metadata. Returns None if not found."""
        try:
            resp = self._client.head_object(Bucket=self.bucket, Key=key)
            return {
                "key": key,
                "size": resp["ContentLength"],
                "content_type": resp.get("ContentType", ""),
                "last_modified": resp["LastModified"].isoformat(),
            }
        except ClientError:
            return None

    # -- Test connection -------------------------------------------------------

    def test_connection(self) -> dict:
        """Verify S3 connectivity by listing the bucket."""
        try:
            self._client.head_bucket(Bucket=self.bucket)
            return {"ok": True, "bucket": self.bucket}
        except ClientError as e:
            code = e.response["Error"]["Code"]
            return {"ok": False, "bucket": self.bucket, "error": code}


# Module-level singleton (lazy init)
_instance: CloudStorage | None = None


def get_cloud_storage() -> CloudStorage:
    global _instance
    if _instance is None:
        _instance = CloudStorage()
    return _instance
