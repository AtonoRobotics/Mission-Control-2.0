"""
Mission Control Backend — Core Settings
Reads exclusively from environment variables (.env.machines).
No default values for infrastructure addresses or credentials.
"""

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env.machines"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- Machine addresses ---
    MC_HOST_PRIMARY: str = "localhost"
    MC_HOST_TRAINING: str | None = None
    MC_HOST_STORAGE: str | None = None

    # --- Ports ---
    MC_ROSBRIDGE_PORT: int = 9090
    MC_API_PORT: int = 8000
    MC_UI_PORT: int = 3000
    MC_DB_PORT: int = 5432

    # --- Database ---
    MC_EMPIRICAL_DB_URL: str
    MC_REGISTRY_DB_URL: str

    # --- Storage paths (defaults for dev — override in production) ---
    MC_BAG_STORAGE_PATH: str = ""
    MC_URDF_REGISTRY_PATH: str = ""
    MC_USD_REGISTRY_PATH: str = ""
    MC_CONFIG_REGISTRY_PATH: str = ""
    MC_CALIBRATION_PATH: str = ""
    MC_DATASET_PATH: str = ""
    MC_MODEL_PATH: str = ""
    MC_SCRIPT_REGISTRY_PATH: str = ""

    # --- ROS2 ---
    ROS_DOMAIN_ID: int = 0

    # --- Isaac ---
    MC_NUCLEUS_URL: str | None = None
    MC_ISAAC_SIM_WORKDIR: str = ""
    MC_ISAAC_LAB_WORKDIR: str = ""

    # --- Containers ---
    MC_CONTAINER_ISAAC_ROS: str = "isaac-ros-main"
    MC_CONTAINER_ISAAC_SIM: str = "isaac-sim"
    MC_CONTAINER_ISAAC_LAB: str = "isaac-lab"
    MC_CONTAINER_GROOT: str = "groot"
    MC_CONTAINER_COSMOS: str = "cosmos"

    # --- LLM (Ollama on DGX Spark) ---
    MC_OLLAMA_BASE_URL: str = "http://spark-2b53.local:11434/v1"
    MC_OLLAMA_MODEL: str = "qwen2.5-coder:32b"
    MC_OLLAMA_TIMEOUT: int = 300

    # --- Security ---
    MC_SECRET_KEY: str

    @field_validator("MC_SECRET_KEY")
    @classmethod
    def secret_key_must_be_set(cls, v: str) -> str:
        if not v or len(v) < 32:
            raise ValueError(
                "MC_SECRET_KEY must be set and at least 32 characters. "
                "Generate with: openssl rand -hex 32"
            )
        return v

    @property
    def rosbridge_url(self) -> str:
        return f"ws://{self.MC_HOST_PRIMARY}:{self.MC_ROSBRIDGE_PORT}"

    @property
    def container_map(self) -> dict[str, str]:
        return {
            "isaac-ros-main": self.MC_CONTAINER_ISAAC_ROS,
            "isaac-sim": self.MC_CONTAINER_ISAAC_SIM,
            "isaac-lab": self.MC_CONTAINER_ISAAC_LAB,
            "groot": self.MC_CONTAINER_GROOT,
            "cosmos": self.MC_CONTAINER_COSMOS,
        }


def get_settings() -> Settings:
    return Settings()
