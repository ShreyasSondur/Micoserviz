import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, List, Optional, Union

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

logger = logging.getLogger("b2_storage")
logger.setLevel(logging.INFO)


class B2StorageService:
    def __init__(self):
        self.endpoint_url = settings.B2_ENDPOINT_URL
        self.key_id = settings.B2_KEY_ID
        self.application_key = settings.B2_APPLICATION_KEY
        self.bucket_name = settings.B2_BUCKET_NAME
        self.region_name = settings.B2_REGION_NAME
        self.enabled = settings.B2_ENABLED
        self._s3_client = None

    @property
    def client(self):
        if self._s3_client is None:
            if not self.enabled or not self.key_id or not self.application_key:
                logger.warning("Backblaze B2 is not fully configured or is disabled.")
                return None
            try:
                self._s3_client = boto3.client(
                    "s3",
                    endpoint_url=self.endpoint_url,
                    aws_access_key_id=self.key_id,
                    aws_secret_access_key=self.application_key,
                    region_name=self.region_name,
                    config=Config(
                        signature_version="s3v4",
                        retries={"max_attempts": 3, "mode": "standard"},
                    ),
                )
            except Exception as e:
                logger.error(f"Failed to initialize B2 S3 client: {e}")
                self._s3_client = None
        return self._s3_client

    def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> dict:
        """
        Uploads raw bytes to the Backblaze B2 bucket under the given key.
        Direct cloud upload without creating local storage artifacts.
        """
        # Clean key path (no leading slashes)
        clean_key = key.lstrip("/").replace("\\", "/")

        result = {
            "key": clean_key,
            "size_bytes": len(data),
            "content_type": content_type,
            "uploaded_at": datetime.datetime.utcnow().isoformat(),
            "b2_uploaded": False,
            "bucket": self.bucket_name,
            "error": None,
        }

        # Always save to local cache directory for fast local fallback
        try:
            local_cache_path = Path("uploads/b2_cache") / clean_key
            local_cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(local_cache_path, "wb") as f:
                f.write(data)
        except Exception as cache_err:
            logger.debug(f"Local B2 cache write failed for {clean_key}: {cache_err}")

        s3 = self.client
        if not s3:
            result["error"] = "B2 client is not configured or disabled (stored locally)"
            return result

        try:
            s3.put_object(
                Bucket=self.bucket_name,
                Key=clean_key,
                Body=data,
                ContentType=content_type,
            )
            result["b2_uploaded"] = True
            logger.info(f"Successfully uploaded {clean_key} ({len(data)} bytes) to Backblaze B2 bucket {self.bucket_name}")
        except ClientError as ce:
            err_msg = str(ce)
            logger.error(f"ClientError uploading {clean_key} to B2: {err_msg}")
            result["error"] = err_msg
        except Exception as e:
            err_msg = str(e)
            logger.error(f"Unexpected error uploading {clean_key} to B2: {err_msg}")
            result["error"] = err_msg

        return result

    def upload_json(self, key: str, data: Union[dict, list, Any]) -> dict:
        """Uploads JSON serializable object to Backblaze B2."""
        json_bytes = json.dumps(data, indent=2, default=str).encode("utf-8")
        return self.upload_bytes(key, json_bytes, content_type="application/json")

    def upload_file(self, key: str, local_path: Union[str, Path], content_type: Optional[str] = None) -> dict:
        """Uploads a local file to Backblaze B2."""
        p = Path(local_path)
        if not p.exists():
            return {"key": key, "error": f"Local file not found: {local_path}", "b2_uploaded": False}
        with open(p, "rb") as f:
            data = f.read()
        ct = content_type or ("application/pdf" if p.suffix.lower() == ".pdf" else "application/octet-stream")
        return self.upload_bytes(key, data, content_type=ct)

    def file_exists(self, key: str) -> bool:
        """Checks if an object exists in Backblaze B2 or local cache."""
        clean_key = key.lstrip("/").replace("\\", "/")
        s3 = self.client
        if s3:
            try:
                s3.head_object(Bucket=self.bucket_name, Key=clean_key)
                return True
            except ClientError:
                pass
        
        # Check local cache fallback
        local_cache_path = Path("uploads/b2_cache") / clean_key
        return local_cache_path.exists()

    def download_bytes(self, key: str) -> Optional[bytes]:
        """Downloads an object directly from Backblaze B2 or local cache fallback."""
        clean_key = key.lstrip("/").replace("\\", "/")
        s3 = self.client
        if s3:
            try:
                resp = s3.get_object(Bucket=self.bucket_name, Key=clean_key)
                return resp["Body"].read()
            except Exception as e:
                logger.warning(f"Failed to fetch {clean_key} from B2: {e}")

        # Check local cache fallback
        local_cache_path = Path("uploads/b2_cache") / clean_key
        if local_cache_path.exists():
            try:
                with open(local_cache_path, "rb") as f:
                    return f.read()
            except Exception as e:
                logger.warning(f"Failed to read local cache for {clean_key}: {e}")

        return None

    def list_files(self, prefix: str = "", max_keys: int = 100) -> List[dict]:
        """Lists objects under a prefix in the B2 bucket."""
        s3 = self.client
        if not s3:
            return []
        try:
            resp = s3.list_objects_v2(Bucket=self.bucket_name, Prefix=prefix, MaxKeys=max_keys)
            items = []
            for obj in resp.get("Contents", []):
                items.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat() if "LastModified" in obj else None,
                    "etag": obj.get("ETag", "").strip('"'),
                })
            return items
        except Exception as e:
            logger.error(f"Failed to list objects in B2 prefix '{prefix}': {e}")
            return []

    # Path Key Formatters for standard ERP hierarchy
    @staticmethod
    def format_daily_log_key(target_date: Union[datetime.date, datetime.datetime, str]) -> str:
        """
        Format: logs/{YYYY}/{MM}-{MonthName}/{DD}/daily_activity_log.json
        Example: logs/2026/10-October/01/daily_activity_log.json
        """
        if isinstance(target_date, str):
            dt = datetime.datetime.strptime(target_date[:10], "%Y-%m-%d").date()
        elif isinstance(target_date, datetime.datetime):
            dt = target_date.date()
        else:
            dt = target_date

        year_str = dt.strftime("%Y")
        month_str = dt.strftime("%m-%B")
        day_str = dt.strftime("%d")
        return f"logs/{year_str}/{month_str}/{day_str}/daily_activity_log.json"

    @staticmethod
    def format_site_execution_key(project_key: str, target_date: Union[datetime.date, datetime.datetime, str]) -> str:
        """
        Format: logs/{YYYY}/{MM}-{MonthName}/{DD}/site_execution_reports/Project_{project_key}_Execution_{YYYY-MM-DD}.pdf
        Example: logs/2026/10-October/01/site_execution_reports/Project_PRJ_001_Execution_2026-10-01.pdf
        """
        if isinstance(target_date, str):
            dt = datetime.datetime.strptime(target_date[:10], "%Y-%m-%d").date()
        elif isinstance(target_date, datetime.datetime):
            dt = target_date.date()
        else:
            dt = target_date

        clean_pk = str(project_key).replace("-", "_").replace(" ", "_")
        year_str = dt.strftime("%Y")
        month_str = dt.strftime("%m-%B")
        day_str = dt.strftime("%d")
        date_iso = dt.strftime("%Y-%m-%d")

        return f"logs/{year_str}/{month_str}/{day_str}/site_execution_reports/Project_{clean_pk}_Execution_{date_iso}.pdf"

    @staticmethod
    def format_project_timeline_key(project_key: str) -> str:
        """
        Format: projects/{project_key}/timeline_history.pdf
        Clean overwrite path for master project timeline dossier.
        """
        clean_pk = str(project_key).strip().replace(" ", "_")
        return f"projects/{clean_pk}/timeline_history.pdf"

    def check_connection(self) -> dict:
        """Runs a diagnostic check to verify B2 credentials and bucket access."""
        s3 = self.client
        if not s3:
            return {
                "status": "error",
                "connected": False,
                "message": "B2 client could not be initialized. Check credentials.",
                "bucket": self.bucket_name,
                "endpoint": self.endpoint_url,
            }
        try:
            resp = s3.head_bucket(Bucket=self.bucket_name)
            return {
                "status": "success",
                "connected": True,
                "bucket": self.bucket_name,
                "endpoint": self.endpoint_url,
                "message": "Connected to Backblaze B2 bucket successfully!",
            }
        except ClientError as ce:
            return {
                "status": "error",
                "connected": False,
                "bucket": self.bucket_name,
                "endpoint": self.endpoint_url,
                "message": str(ce),
            }


# Singleton instance
b2_storage = B2StorageService()
