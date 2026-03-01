"""
Mission Control Backend — Core Settings
Reads exclusively from environment variables (.env.machines).
No default values for infrastructure addresses or credentials.
"""

from pydantic import PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.machines",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # --- Machine addresses ---
    MC_HOST_PRIMARY: str
    MC_HOST_TRAINING: str | None = None
    MC_HOST_STORAGE: str | None = None

    # --- Ports ---
    MC_ROSBRIDGE_PORT: int
    MC_API_PORT: int
    MC_UI_PORT: int
    MC_DB_PORT: int

    # --- Database ---
    MC_EMPIRICAL_DB_URL: PostgresDsn
    MC_REGISTRY_DB_URL: PostgresDsn

    # --- Storage paths ---
    MC_BAG_STORAGE_PATH: str
    MC_URDF_REGISTRY_PATH: str
    MC_USD_REGISTRY_PATH: str
    MC_CONFIG_REGISTRY_PATH: str
    MC_CALIBRATION_PATH: str
    MC_DATASET_PATH: str
    MC_MODEL_PATH: str
    MC_SCRIPT_REGISTRY_PATH: str

    # --- ROS2 ---
    ROS_DOMAIN_ID: int

    # --- Isaac ---
    MC_NUCLEUS_URL: str | None = None
    MC_ISAAC_SIM_WORKDIR: str
    MC_ISAAC_LAB_WORKDIR: str

    # --- Containers ---
    MC_CONTAINER_ISAAC_ROS: str
    MC_CONTAINER_ISAAC_SIM: str
    MC_CONTAINER_ISAAC_LAB: str
    MC_CONTAINER_GROOT: str
    MC_CONTAINER_COSMOS: str

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
