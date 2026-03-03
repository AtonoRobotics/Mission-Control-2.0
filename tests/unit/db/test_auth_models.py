"""Test that auth tables exist in the registry database."""

import subprocess


def test_auth_tables_exist():
    """Verify users, teams, and sessions tables exist in the registry DB."""
    result = subprocess.run(
        [
            "docker", "exec", "mc-postgres",
            "psql", "-U", "mc", "-d", "registry", "-t", "-c",
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;",
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    tables = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
    assert "users" in tables, f"'users' table not found. Tables: {tables}"
    assert "teams" in tables, f"'teams' table not found. Tables: {tables}"
    assert "sessions" in tables, f"'sessions' table not found. Tables: {tables}"


def test_users_table_columns():
    """Verify users table has expected columns."""
    result = subprocess.run(
        [
            "docker", "exec", "mc-postgres",
            "psql", "-U", "mc", "-d", "registry", "-t", "-c",
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='users' ORDER BY ordinal_position;",
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    columns = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
    expected = ["user_id", "email", "display_name", "password_hash", "role", "team_id"]
    for col in expected:
        assert col in columns, f"Column '{col}' not in users table. Columns: {columns}"


def test_sessions_table_has_token_hash():
    """Verify sessions table has token_hash column for secure session storage."""
    result = subprocess.run(
        [
            "docker", "exec", "mc-postgres",
            "psql", "-U", "mc", "-d", "registry", "-t", "-c",
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='sessions' ORDER BY ordinal_position;",
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    columns = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
    assert "token_hash" in columns, f"'token_hash' not in sessions table. Columns: {columns}"
    assert "user_id" in columns, f"'user_id' not in sessions table. Columns: {columns}"
    assert "expires_at" in columns, f"'expires_at' not in sessions table. Columns: {columns}"
