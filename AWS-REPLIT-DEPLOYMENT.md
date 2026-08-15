# دليل النشر على AWS و Replit

> دليل شامل لتجربة GarfiX على AWS (EC2 + RDS + ElastiCache) وعلى Replit.

---

## 📋 جدول المقارنة السريع

| المعيار | AWS EC2 | AWS ECS Fargate | Replit |
|---------|---------|------------------|--------|
| **الصعوبة** | متوسط | متقدم | سهل جداً |
| **التكلفة** | $5-35/شهر | $10-50/شهر | $7-20/شهر |
| **الوقت للنشر** | 30-60 دقيقة | 1-2 ساعة | 5-10 دقائق |
| **التحكم الكامل** | ✅ | ✅ | ❌ محدود |
| **SSL تلقائي** | ❌ (يدوي) | ✅ (ALB) | ✅ |
| **Auto-scaling** | ❌ (يدوي) | ✅ | ❌ |
| **المنطقة العربية** | ✅ (Bahrain) | ✅ (Bahrain) | ❌ (US/EU) |
| **Database مُدار** | RDS ($20+) | RDS ($20+) | مدمج |
| **Redis مُدار** | ElastiCache ($12+) | ElastiCache ($12+) | ⚠️ (بدون Redis) |
| **مناسب للإنتاج** | ✅ | ✅ | ⚠️ للتجربة فقط |

---

## 🟠 النشر على AWS — طريقتان

### الطريقة 1️⃣: AWS EC2 + Docker (الأسهل للبدء)

**السيرفر المقترح:** `t3.medium` (2 vCPU, 4GB RAM) — ~$30/شهر
أو `t3.small` (2 vCPU, 2GB RAM) — ~$15/شهر (للتجربة فقط)

#### الخطوة 1: إنشاء EC2 Instance

```
1. اذهب لـ AWS Console → EC2 → Launch Instance
2. الاسم: garfix-prod
3. AMI: Ubuntu Server 24.04 LTS (x86)
4. Instance Type: t3.medium (أنصح به للإنتاج)
5. Key Pair: أنشئ جديد (garfix-key.pem) — احفظه بأمان!
6. Network Settings:
   - VPC: default
   - Subnet: default
   - Auto-assign public IP: Enable
   - Security Group: أنشئ جديد باسم "garfix-sg"
     - SSH (22) — My IP فقط
     - HTTP (80) — Anywhere
     - HTTPS (443) — Anywhere
     - Custom TCP (3000) — My IP (للتجربة فقط)
7. Storage: 30 GB gp3 SSD
8. Launch Instance
```

**المنطقة الأفضل:** `me-south-1` (Bahrain) — latency ~15ms للسعودية/مصر
**المنطقة البديلة:** `eu-central-1` (Frankfurt) — latency ~50ms

#### الخطوة 2: إعداد السيرفر

```bash
# SSH للسيرفر
ssh -i garfix-key.pem ubuntu@<EC2-PUBLIC-IP>

# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker + Docker Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# تثبيت أدوات مساعدة
sudo apt install -y git nginx certbot python3-certbot-nginx ufw

# إعداد الـ firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

#### الخطوة 3: استنساخ المشروع + الإعداد

```bash
# استنساخ المشروع
cd /opt
sudo git clone https://github.com/ahmedezzatelsayad/Garfix.git
sudo chown -R $USER:$USER Garfix
cd Garfix

# إعداد البيئة
cp .env.example .env
nano .env
```

**عدّل ملف `.env` بالقيم التالية:**
```bash
# Database (PostgreSQL في Docker — على نفس السيرفر)
DB_USER=garfix
DB_PASS=$(openssl rand -hex 32)
DB_NAME=garfix
DATABASE_URL=postgresql://garfix:${DB_PASS}@localhost:5432/garfix?schema=public
DATABASE_DIRECT_URL=postgresql://garfix:${DB_PASS}@localhost:5432/garfix

# Valkey (Redis — في Docker)
VALKEY_PASSWORD=$(openssl rand -hex 32)
VALKEY_URL=redis://:${VALKEY_PASSWORD}@localhost:6379

# JWT (أسرار عشوائية)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# تشفير المدفوعات
PAYMENTS_ENC_KEY=$(openssl rand -base64 32)

# المؤسس
FOUNDER_EMAIL=your@email.com
FOUNDER_PASSWORD=Your-Strong-Password-2026!

# الإعدادات العامة
NODE_ENV=production
APP_URL=https://garfix.yourdomain.com
SETUP_COMPLETE=true

# AI (اختياري — للتجربة)
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_MODEL=deepseek-chat

# خط Cairo (Vercel/CI فقط)
GARFIX_USE_GOOGLE_FONT=1
```

#### الخطوة 4: تشغيل Docker Compose

```bash
# تشغيل الـ migrations أولاً
docker compose -f docker-compose.prod.yml run --rm app bunx prisma migrate deploy

# تشغيل الـ seed (اختياري — لإضافة بيانات تجريبية)
docker compose -f docker-compose.prod.yml run --rm app bunx prisma db seed

# تشغيل التطبيق
docker compose -f docker-compose.prod.yml up -d

# التحقق من الحالة
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000/api/health
# Expected: {"status":"ok","db":{"ok":true}...}
```

#### الخطوة 5: إعداد Nginx + SSL

```bash
# إعداد Nginx كـ reverse proxy
sudo tee /etc/nginx/sites-available/garfix.conf << 'EOF'
server {
    listen 80;
    server_name garfix.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/garfix.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# SSL مجاني من Let's Encrypt
sudo certbot --nginx -d garfix.yourdomain.com --non-interactive --agree-tos -m your@email.com

# التجديد التلقائي (شهادة 90 يوم)
sudo crontab -e
# أضف:
0 3 * * * certbot renew --quiet --post-hook "systemctl reload nginx"
```

#### الخطوة 6: إعداد DNS

```
A    garfix.yourdomain.com    →  <EC2-PUBLIC-IP>
AAAA garfix.yourdomain.com    →  <EC2-PUBLIC-IPV6> (إن وُجد)
```

#### الخطوة 7: التحقق النهائي

```bash
# فحص الـ health
curl https://garfix.yourdomain.com/api/health

# فحص الـ setup status
curl https://garfix.yourdomain.com/api/setup/status
# Expected: {"setupComplete":true,"version":1}

# افتح المتصفح
# https://garfix.yourdomain.com/login
# سجّل دخول بـ FOUNDER_EMAIL + FOUNDER_PASSWORD
```

---

### الطريقة 2️⃣: AWS EC2 + RDS + ElastiCache (للإنتاج الحقيقي)

**التكلفة:** ~$70/شهر (App + DB + Cache)

#### المعمارية:
```
Internet → Route53 → CloudFront → ALB → EC2 (GarfiX)
                                              ↓
                                    RDS PostgreSQL (managed)
                                              ↓
                                    ElastiCache Valkey (managed)
```

#### الخطوات:

1. **RDS PostgreSQL:**
   - Console → RDS → Create Database
   - Engine: PostgreSQL 17
   - Template: Free tier (db.t3.micro — 1 vCPU, 1GB RAM) للتجربة
   - أو Production (db.t3.small — 2 vCPU, 2GB RAM) للإنتاج
   - DB instance identifier: `garfix-db`
   - Master username: `garfix`
   - Master password: (أسرار قوية)
   - VPC: نفس EC2
   - Public access: No (فقط من داخل VPC)
   - Security Group: اسمح 5432 من EC2 security group فقط

2. **ElastiCache Valkey:**
   - Console → ElastiCache → Create
   - Engine: Valkey 8
   - Node type: `cache.t3.micro` (للتجربة) — ~$12/شهر
   - Replication: Single node (للتجربة)
   - Security Group: اسمح 6379 من EC2 security group فقط

3. **EC2:**
   - نفس الخطوات السابقة، لكن:
   - `DATABASE_URL` = RDS endpoint
   - `VALKEY_URL` = ElastiCache endpoint
   - لا تحتاج PostgreSQL/Valkey في Docker

```bash
# ملف .env معدّل للإنتاج
DATABASE_URL=postgresql://garfix:PASSWORD@garfix-db.xxxxxx.me-south-1.rds.amazonaws.com:5432/garfix
DATABASE_DIRECT_URL=postgresql://garfix:PASSWORD@garfix-db.xxxxxx.me-south-1.rds.amazonaws.com:5432/garfix
VALKEY_URL=rediss://garfix-valkey.xxxxxx.emeu1.cache.amazonaws.com:6379
```

---

### الطريقة 3️⃣: AWS ECS Fargate (Serverless containers)

**التكلفة:** ~$15-30/شهر (pay per use)

```bash
# 1. اPush Docker image إلى ECR
aws ecr create-repository --repository-name garfix
docker build -t garfix .
docker tag garfix:latest <AWS_ACCOUNT>.dkr.ecr.me-south-1.amazonaws.com/garfix:latest
aws ecr get-login-password | docker login --username AWS --password-stdin <AWS_ACCOUNT>.dkr.ecr.me-south-1.amazonaws.com
docker push <AWS_ACCOUNT>.dkr.ecr.me-south-1.amazonaws.com/garfix:latest

# 2. أنشئ ECS Cluster + Task Definition + Service
# (عبر AWS Console أو Terraform/CDK)
```

**المميزات:**
- ✅ لا حاجة لإدارة سيرفر
- ✅ Pay per use (تدفع فقط عندما يعمل)
- ✅ Auto-scaling تلقائي
- ❌ إعداد معقد
- ❌ أغلى من EC2 للحمل المنخفض

---

### النشر التلقائي عبر GitHub Actions

المشروع به workflow جاهز للنشر على AWS EC2:
`.github/workflows/deploy-aws.yml`

**الإعداد:**
1. اذهب لـ GitHub Repo → Settings → Secrets and variables → Actions
2. أضف هذه الأسرار:

```
EC2_HOST_STAGING=<staging-server-ip>
EC2_HOST_PRODUCTION=<prod-server-ip>
EC2_SSH_KEY=<private-key-content>
AWS_REGION=me-south-1
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
```

3. اذهب لـ Actions → "Deploy to AWS EC2" → Run workflow

**ما يحدث تلقائياً:**
1. بناء Docker image
2. نسخه للـ EC2 عبر SCP
3. تشغيل `prisma migrate deploy`
4. تشغيل `docker compose up -d` بالنسخة الجديدة
5. حفظ النسخة القديمة كـ `garfix:previous` (للـ rollback)

---

## 🔵 النشر على Replit

### الطريقة 1️⃣: Replit (الأسهل للتجربة السريعة)

**التكلفة:** $7/شهر (Replit Core) أو مجاني (مساحة محدودة)

#### الخطوة 1: إنشاء Repl

```
1. اذهب لـ https://replit.com
2. سجّل دخول / أنشئ حساب
3. New Repl → Import from GitHub
4. GitHub URL: https://github.com/ahmedezzatelsayad/Garfix
5. Language: Node.js
6. Create Repl
```

#### الخطوة 2: إعداد البيئة

في Replit، اذهب لـ **Tools → Secrets** (أو `.env` tab) وأضف:

```
DATABASE_URL=postgresql://neondb_owner:npg_gAMHkIK3S5rn@ep-tiny-butterfly-ayu6rae7-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require
DATABASE_DIRECT_URL=postgresql://neondb_owner:npg_gAMHkIK3S5rn@ep-tiny-butterfly-ayu6rae7-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=e2e-test-jwt-secret-at-least-32-characters-long!!
JWT_REFRESH_SECRET=e2e-test-refresh-secret-at-least-32-chars!!
PAYMENTS_ENC_KEY=e2e-test-encryption-key-at-least-32-characters!
FOUNDER_EMAIL=founder@garfix.app
FOUNDER_PASSWORD=FounderPass2026!
VALKEY_URL=redis://localhost:6379
NODE_ENV=production
SETUP_COMPLETE=true
GARFIX_USE_GOOGLE_FONT=1
GARFIX_SKIP_INSTRUMENTATION=1
```

> **ملاحظة**: Replit لا يدعم Valkey/Redis محلياً. استخدم Upstash Redis
> المجاني: https://upstash.com → أنشئ Redis → انسخ الـ URL

```
VALKEY_URL=rediss://default:password@xxx.upstash.io:6379
```

#### الخطوة 3: إعداد `.replit` file

أنشئ ملف `.replit` في جذر المشروع:

```toml
run = "bun run start"
entrypoint = "src/app/page.tsx"
modules = ["nodejs-20"]

[nix]
channel = "stable-23_11"

[deployment]
run = ["bun", "run", "start"]
deploymentTarget = "cloudrun"
build = ["bun", "run", "build"]

[env]
PORT = "3000"
```

#### الخطوة 4: تعديل `package.json` scripts

```json
{
  "scripts": {
    "start": "next start -p ${PORT:-3000}",
    "build": "next build --webpack",
    "postinstall": "prisma generate",
    "db:deploy": "prisma migrate deploy"
  }
}
```

#### الخطوة 5: تشغيل الـ migrations

```bash
# في Replit Shell
bunx prisma migrate deploy
bunx prisma db seed  # اختياري
```

#### الخطوة 6: البناء + التشغيل

```bash
# بناء التطبيق
bun run build

# تشغيل
bun run start
```

#### الخطوة 7: فتح التطبيق

- Replit يعطيك URL تلقائياً: `https://garfix.yourname.repl.co`
- افتحها في المتصفح
- سجّل دخول بـ `founder@garfix.app` / `FounderPass2026!`

### ⚠️ قيود Replit

1. **لا Valkey/Redis محلي** — استخدم Upstash (مجاني حتى 10K commands/day)
2. **الـ Repl ينام** بعد فترة من عدم النشاط (في الخطة المجانية)
3. **حد المساحة** — 1GB في الخطة المجانية
4. **لا دعم Docker** — لا يمكنك تشغيل docker-compose
5. **الـ Database يجب أن تكون خارجية** — استخدم Neon/Supabase/RDS
6. **الـ background workers لا تعمل** — BullMQ/cron معطلة
7. **الـ file uploads** محدودة — استخدم S3/Cloudinary

### ✅ مزايا Replit

1. **أسهل طريقة للتجربة** — 5 دقائق فقط
2. **SSL تلقائي** — `https://*.repl.co`
3. **Git push to deploy** — اربط GitHub وادفع للتشغيل
4. **IDE مدمج** — عدّل الكود في المتصفح
5. **مجاني للتجربة** — الخطة المجانية تكفي للاختبار

---

## 🆚 مقارنة التجربة: AWS vs Replit

### للتجربة السريعة (5 دقائق):

| الخطوة | Replit | AWS EC2 |
|--------|--------|---------|
| إنشاء حساب | 1 دقيقة | 5 دقائق (بطاقة ائتمان) |
| استيراد المشروع | 30 ثانية (Import from GitHub) | 5 دقائق (git clone) |
| إعداد البيئة | 2 دقيقة (Secrets UI) | 5 دقائق (nano .env) |
| الـ migrations | 30 ثانية (Shell) | 1 دقيقة (docker exec) |
| البناء | 2 دقيقة (bun run build) | 3 دقائق (docker build) |
| التشغيل | تلقائي | 1 دقيقة (docker compose up) |
| SSL | تلقائي | 2 دقيقة (certbot) |
| **الإجمالي** | **~5 دقائق** | **~25 دقيقة** |

### للإنتاج الحقيقي:

| المعيار | AWS EC2 | Replit |
|---------|---------|--------|
| **التكلفة الشهرية** | $15-35 | $7-20 |
| **الموثوقية** | ✅ 99.9% | ⚠️ Repl ينام |
| **الأداء** | ✅ dedicated CPU | ⚠️ shared |
| **الـ Database** | ✅ RDS (managed) | ❌ خارجي |
| **الـ Redis** | ✅ ElastiCache | ❌ Upstash (محدود) |
| **الـ SSL** | ✅ Let's Encrypt | ✅ تلقائي |
| **الـ Backups** | ✅ EBS snapshots | ❌ يدوي |
| **الـ Auto-scaling** | ❌ (يدوي) | ❌ |
| **التحكم الكامل** | ✅ | ❌ |
| **الدعم العربي** | ✅ (Bahrain region) | ❌ (US/EU) |

---

## 🎯 التوصيات

### للتجربة السريعة:
→ **Replit** (5 دقائق + مجاني)

### للإطلاق الأول (0-50 عميل):
→ **AWS EC2 t3.medium** (Bahrain) + Neon PostgreSQL (مجاني)
→ التكلفة: ~$30/شهر

### للإنتاج الحقيقي (50+ عميل):
→ **AWS EC2 t3.large** + RDS PostgreSQL + ElastiCache Valkey
→ التكلفة: ~$70/شهر
→ أو **Hetzner CPX31** ($17/شهر — أفضل قيمة)

### للتوسع (200+ عميل):
→ **AWS ECS Fargate** + RDS + ElastiCache + CloudFront
→ التكلفة: $150+/شهر

---

## 📞 الدعم

- **المشاكل التقنية**: https://github.com/ahmedezzatelsayad/Garfix/issues
- **التوثيق الكامل**: README.md + DEPLOYMENT.md + CHEAP-DEPLOYMENT.md
- **خطوات الطوارئ**: docs/RUNBOOK.md
