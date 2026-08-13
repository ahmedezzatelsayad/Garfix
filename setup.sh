#!/bin/bash
set -e

cd /workspaces/Garfix

echo "🚀 Starting Garfix setup..."

# 1. Check and install PostgreSQL if needed
echo "📦 Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "Installing PostgreSQL..."
    apt-get update && apt-get install -y postgresql postgresql-client
fi

# 2. Start PostgreSQL
echo "🔌 Starting PostgreSQL service..."
service postgresql start || true

# 3. Create database and user
echo "🗄️  Creating database..."
sudo -u postgres psql -c "CREATE DATABASE garfix;" 2>/dev/null || echo "Database already exists"
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || echo "User already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE garfix TO postgres;" 2>/dev/null || true

# 4. Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if pg_isready -h localhost -p 5432 2>/dev/null; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to start"
        exit 1
    fi
    sleep 1
done

# 5. Run Prisma migrations to create tables
echo "📊 Running Prisma migrations to create 106 tables..."
cd /workspaces/Garfix
bun x prisma migrate deploy

echo "✅ Database setup complete!"
echo ""
echo "📋 Summary:"
echo "  - PostgreSQL running on localhost:5432"
echo "  - Database: garfix"
echo "  - User: postgres"
echo "  - Tables: Created by Prisma migrations"
