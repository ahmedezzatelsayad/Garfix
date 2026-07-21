# 🚀 GarfiX EOS v12.0 - Deployment & Operations Guide

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Development Mode](#development-mode)
6. [Production Build](#production-build)
7. [Vercel Deployment](#vercel-deployment)
8. [Docker Deployment](#docker-deployment)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

---

## 🔧 System Requirements

### Minimum Requirements
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | 18.x | 20.x LTS |
| **Bun** | 1.x | Latest |
| **Database** | PostgreSQL 14+ | PostgreSQL 16 |
| **Redis** | 6.x | 7.x (Valkey compatible) |
| **RAM** | 2 GB | 4 GB+ |
| **CPU** | 2 cores | 4 cores |
| **Storage** | 10 GB SSD | 20 GB NVMe |

### Software Dependencies
```bash
# Core Runtime
node --version   # >= 18.0.0
bun --version    # >= 1.0.0

# Databases
psql --version    # PostgreSQL >= 14
redis-server --version  # Redis >= 6
```

---

## ⚡ Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Generate Prisma client
bun run db:generate

# 5. Push database schema
bun run db:push

# 6. Start development server
bun run dev
```

---

## 🌍 Environment Configuration

### Required Variables (.env)

```bash
# ═══════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════
DATABASE_URL="postgresql://user:password@localhost:5432/garfix?schema=public"

# ═══════════════════════════════════════════════════════════════
# AUTHENTICATION (REQUIRED - min 32 characters each)
# ═══════════════════════════════════════════════════════════════
JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters-long!"
JWT_REFRESH_SECRET="your-different-refresh-secret-32-chars-minimum!"

# ═══════════════════════════════════════════════════════════════
# ENCRYPTION
# ═══════════════════════════════════════════════════════════════
PAYMENTS_ENC_KEY="encryption-key-for-payments-32-chars!"

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: Cache/Queue
# ═══════════════════════════════════════════════════════════════
REDIS_URL="redis://localhost:6379"
VALKEY_URL="valkey://localhost:6379"

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: AI Provider (OpenRouter)
# ═══════════════════════════════════════════════════════════════
OPENROUTER_API_KEY="sk-or-v1-your-openrouter-key"

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: WhatsApp Integration
# ═══════════════════════════════════════════════════════════════
WHATSAPP_VERIFY_TOKEN="your-verify-token"
WHATSAPP_ACCESS_TOKEN="your-access-token"
WHATSAPP_ALLOWED_SENDERS="+1234567890"

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: Email (Nodemailer)
# ═══════════════════════════════════════════════════════════════
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

### Security Notes
⚠️ **NEVER commit `.env` to version control!**
- Use different secrets for development/staging/production
- Rotate secrets every 90 days
- Use a secrets manager in production (AWS Secrets Manager, HashiCorp Vault, etc.)

---

## 💾 Database Setup

### PostgreSQL Setup

```bash
# Create database
createdb garfix
createdb garfix_test  # For testing

# Run migrations
bun run db:migrate deploy

# Or push schema directly (development only)
bun run db:push
```

### Schema Overview

GarfiX uses **72 Prisma models** including:

| Category | Models | Description |
|----------|--------|-------------|
| **Core** | User, Company, Tenant | Multi-tenant architecture |
| **Invoicing** | Invoice, InvoiceItem, Client | Full invoice lifecycle |
| **HR** | Employee, Attendance, Salary | HR management |
| **Inventory** | Item, Warehouse, Movement | Stock tracking |
| **AI** | AiUsage, ModelConfig | AI provider integration |
| **Security** | AuditLog, MfaSecret | Compliance & security |

### Seeding Test Data

```bash
# Seed with sample data
bun run seed

# Seed specific count
bunx ts-node scripts/seed.ts --companies=100 --invoices-per-company=50
```

---

## 🛠️ Development Mode

### Starting the Dev Server

```bash
# Start Next.js dev server on port 3000
bun run dev

# Server will be available at:
# http://localhost:3000
```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Dev** | `bun run dev` | Start development server |
| **Build** | `bun run build` | Production build |
| **Start** | `bun run start` | Start production server |
| **Lint** | `bun run lint` | Run ESLint |
| **Type Check** | `bunx tsc --noEmit` | TypeScript validation |
| **Test** | `bun test` | Run unit tests |
| **DB Generate** | `bun run db:generate` | Generate Prisma client |
| **DB Push** | `bun run db:push` | Push schema to DB |
| **DB Migrate** | `bun run db:migrate dev` | Create new migration |
| **Seed** | `bun run seed` | Seed test data |

### Hot Reload
- ✅ Next.js Turbopack enabled
- ✅ React Fast Refresh
- ✅ Auto-restart on file changes

---

## 🏗️ Production Build

### Building for Production

```bash
# 1. Install production dependencies
bun install --production=false  # Include devDependencies for build

# 2. Generate Prisma client
bun run db:generate

# 3. Build the application
bun run build

# Output structure:
# .next/
# ├── standalone/          # Self-contained deployment
# └── static/              # Static assets
```

### Build Verification

```bash
# Verify TypeScript compilation
bunx tsc --noEmit -p tsconfig.prod.json  # Should show 0 errors

# Verify ESLint passes
bun run lint  # Should show 0 errors

# Test production build locally
NODE_ENV=production bun .next/standalone/server.js
```

---

## ☁️ Vercel Deployment

### Prerequisites
1. GitHub repository connected to Vercel
2. PostgreSQL database (Neon, Supabase, or AWS RDS)
3. Redis instance (Upstash, Redis Cloud)

### Vercel Configuration

The project includes `vercel.json` with optimal settings:

```json
{
  "buildCommand": "bun run build",
  "installCommand": "bun install",
  "functions": {
    "src/app/api/**/*.ts": { "maxDuration": 60 },
    "src/app/api/ai/**/*.ts": { "maxDuration": 120 }
  }
}
```

### Deployment Steps

1. **Import Project**
   ```
   https://vercel.com/new → Import Git Repository → Select GarfiX
   ```

2. **Set Environment Variables**
   Go to: Settings → Environment Variables
   
   Required:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `PAYMENTS_ENC_KEY`

3. **Deploy**
   Click "Deploy" - Vercel will automatically:
   - Install dependencies with Bun
   - Generate Prisma client
   - Build Next.js application
   - Deploy to edge network

### Post-Deployment Checks

```bash
# Health check
curl https://your-domain.vercel.app/api/health

# Expected response:
{
  "status": "healthy",
  "version": "12.0.0",
  "database": "connected",
  "timestamp": "2026-07-21T..."
}
```

---

## 🐳 Docker Deployment

### Dockerfile (Included)

```bash
# Build image
docker build -t garfix-eos:v12 .

# Run container
docker run -d \
  --name garfix \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  -e JWT_REFRESH_SECRET="your-secret" \
  -e PAYMENTS_ENC_KEY="your-key" \
  garfix-eos:v12
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/garfix
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - PAYMENTS_ENC_KEY=${PAYMENTS_ENC_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: garfix
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## 📊 Monitoring & Maintenance

### Health Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `/api/health` | System health check | Public |
| `/api/startup-check` | Detailed startup status | Internal |
| `/platform-admin/stats` | Platform metrics | Admin |

### Key Metrics to Monitor

1. **Response Time**: API endpoints < 500ms (P95)
2. **Error Rate**: < 1% (4xx), < 0.1% (5xx)
3. **Database Connections**: Pool utilization < 80%
4. **Memory Usage**: RSS < 512MB per instance
5. **AI Token Usage**: Cost tracking via `/api/platform-admin/ai-usage`

### Backup Strategy

```bash
# Database backup
pg_dump garfix > backup_$(date +%Y%m%d).sql

# Automated backup script
bun run scripts/backup.ts
```

### Log Management

```bash
# View application logs
tail -f logs/server.log

# Structured logging is enabled by default
# Logs include: timestamp, level, requestId, userId, companySlug
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Build Fails: "Module not found '.prisma/client/default'"

**Cause:** Prisma client not generated

**Solution:**
```bash
bun run db:generate
bun run build
```

#### 2. JWT_SECRET Error on Startup

**Cause:** Missing or short JWT secret

**Solution:**
```bash
# Ensure .env contains:
JWT_SECRET="at-least-32-characters-long-secret-key-here!"
```

#### 3. Database Connection Refused

**Cause:** PostgreSQL not running or wrong connection string

**Solution:**
```bash
# Check PostgreSQL is running
pg_isready

# Verify connection string format
postgresql://user:password@host:5432/database?schema=public
```

#### 4. Port Already in Use

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill process or change port
bun run dev -- -p 3001
```

#### 5. Memory Issues in Development

**Solution:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
bun run dev
```

### Performance Optimization

1. **Enable Response Caching**
   ```typescript
   // In API routes
   export const revalidate = 60; // Cache for 60 seconds
   ```

2. **Database Connection Pooling**
   ```prisma
   // prisma/schema.prisma
   datasource db {
     url = env("DATABASE_URL")
   }
   ```

3. **Redis Caching**
   Ensure `REDIS_URL` or `VALKEY_URL` is set for automatic caching.

---

## 📞 Support & Resources

### Documentation Links
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Bun Documentation](https://bun.sh/docs)

### Getting Help
1. Check existing GitHub Issues
2. Create new issue with:
   - Environment details
   - Error logs
   - Steps to reproduce

---

## 📄 License

Copyright © 2026 GarfiX EOS. All rights reserved.

**Version:** 12.0.0  
**Last Updated:** 2026-07-21
