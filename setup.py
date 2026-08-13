#!/usr/bin/env python3
import subprocess
import os
import time
import sys

os.chdir('/workspaces/Garfix')

def run_command(cmd, description):
    print(f"\n{'='*60}")
    print(f"▶️  {description}")
    print(f"{'='*60}")
    print(f"Command: {cmd}\n")
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        
        if result.stdout:
            print(result.stdout)
        if result.stderr and result.returncode != 0:
            print("STDERR:", result.stderr, file=sys.stderr)
        
        if result.returncode != 0:
            print(f"⚠️  Command returned code {result.returncode}")
        else:
            print(f"✅ {description} completed successfully")
        
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print(f"❌ Command timed out")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Main setup
print("🚀 GarfiX Database Setup & Project Launch")
print("=" * 60)

# 1. Check and install PostgreSQL
if not run_command("which psql", "Checking PostgreSQL installation"):
    print("\n📦 Installing PostgreSQL...")
    run_command("apt-get update && apt-get install -y postgresql postgresql-client", "Installing PostgreSQL")

# 2. Start PostgreSQL
run_command("service postgresql start", "Starting PostgreSQL service")

# 3. Wait and verify PostgreSQL
print("\n⏳ Waiting for PostgreSQL to be ready...")
for i in range(30):
    try:
        subprocess.run("pg_isready -h localhost -p 5432", shell=True, capture_output=True, timeout=5)
        print("✅ PostgreSQL is ready!")
        break
    except:
        if i < 29:
            time.sleep(1)
        else:
            print("❌ PostgreSQL failed to start")

# 4. Create database and user
run_command("sudo -u postgres psql -c \"CREATE DATABASE garfix;\" 2>/dev/null || echo 'Database might already exist'", "Creating garfix database")
run_command("sudo -u postgres psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\" 2>/dev/null || echo 'User already exists'", "Setting postgres password")
run_command("sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE garfix TO postgres;\" 2>/dev/null", "Granting privileges")

# 5. Run Prisma migrations
run_command("bun x prisma migrate deploy", "Running Prisma migrations (creating 106 tables)")

# 6. Start development server
print("\n" + "=" * 60)
print("🎉 Setup Complete! Starting development server...")
print("=" * 60 + "\n")
run_command("bun run dev", "Starting Garfix development server")
