"""Seed an admin user into the Mission Control database."""

import argparse
import os
import sys
from pathlib import Path

import bcrypt
import psycopg2
from dotenv import load_dotenv

# Load .env.machines from project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env.machines")


def main():
    parser = argparse.ArgumentParser(description="Seed an admin user")
    parser.add_argument("--email", default=os.getenv("MC_ADMIN_EMAIL", "admin@mission-control.local"))
    parser.add_argument("--password", default=os.getenv("MC_ADMIN_PASSWORD"))
    args = parser.parse_args()

    if not args.password:
        print("ERROR: --password or MC_ADMIN_PASSWORD env var required")
        sys.exit(1)

    db_url = os.getenv("MC_REGISTRY_DB_URL")
    if not db_url:
        print("ERROR: MC_REGISTRY_DB_URL not set")
        sys.exit(1)

    hashed = bcrypt.hashpw(args.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (email, display_name, password_hash, auth_provider, role)
                VALUES (%s, 'Admin', %s, 'local', 'admin')
                ON CONFLICT (email) DO UPDATE
                    SET role = 'admin', password_hash = EXCLUDED.password_hash
                RETURNING user_id, email, role
                """,
                (args.email, hashed),
            )
            row = cur.fetchone()
            conn.commit()
            print(f"Admin seeded: user_id={row[0]}, email={row[1]}, role={row[2]}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
