#!/bin/bash
set -e

cd /workspaces/Garfix

echo "🚀 Starting GarfiX Setup..."
echo ""

# Add DB_PASS and other required variables to .env if not present
if ! grep -q "^DB_PASS=" .env; then
    echo "DB_PASS=postgres123secure" >> .env
fi

if ! grep -q "^DB_USER=" .env; then
    echo "DB_USER=garfix" >> .env
fi

if ! grep -q "^DB_NAME=" .env; then
    echo "DB_NAME=garfix" >> .env
fi

if ! grep -q "^VALKEY_PASSWORD=" .env; then
    echo "VALKEY_PASSWORD=valkeypass123" >> .env
fi

if ! grep -q "^NODE_ENV=" .env; then
    echo "NODE_ENV=development" >> .env
fi

echo "✅ .env updated with required variables"
echo ""

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "📦 Docker found. Starting services..."
    docker-compose up -d postgres valkey 2>&1 || echo "Note: Docker services may already be running"
    
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 5
    
    for i in {1..30}; do
        if docker exec garfix-postgres pg_isready -U garfix 2>/dev/null; then
            echo "✅ PostgreSQL is ready!"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "⚠️  PostgreSQL may not be ready, continuing anyway..."
        fi
        sleep 1
    done
else
    echo "⚠️  Docker not found. Skipping containerized PostgreSQL."
    echo "   Please ensure PostgreSQL is running on localhost:5432"
fi

echo ""
echo "📊 Generating Prisma Client..."
bun x prisma generate

echo ""
echo "🗄️  Pushing database schema (creating 106 tables)..."
bun run db:push --skip-generate

echo ""
echo "✅ Database setup complete!"
echo ""
echo "🎉 Starting development server..."
echo "   Access the app at http://localhost:3000"
echo ""

bun run dev
