# GarfiX EOS — AWS Deployment Guide

## المتطلبات

- AWS account
- EC2 instance (t3.medium أو أكبر — 2 vCPU, 4GB RAM)
- PostgreSQL (RDS أو self-hosted في Docker)
- Domain name (اختياري)

---

## الطريقة 1: EC2 + Docker (الأسهل)

### 1. إنشاء EC2 Instance

```bash
# من AWS Console:
# 1. EC2 → Launch Instance
# 2. اختر: Ubuntu Server 24.04 LTS (ami-0c7217cdde317cfec)
# 3. Instance type: t3.medium (أو أكبر)
# 4. Storage: 30 GB gp3
# 5. Security Group:
#    - SSH (port 22) — من الـ IP بتاعك فقط
#    - HTTP (port 80) — من أي مكان
#    - HTTPS (port 443) — من أي مكان
#    - Custom TCP (port 3000) — من أي مكان (للـ app)
# 6. Key pair: أنشئ جديد أو استخدم موجود
# 7. Launch
```

### 2. الاتصال بالـ Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### 3. تثبيت Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker --version
docker-compose --version

# Logout + login again for group changes
exit
```

### 4. استنساخ المشروع

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# Clone
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix

# Install dependencies (for Prisma generate)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun install
bunx prisma generate
```

### 5. إعداد المتغيرات البيئية

```bash
# إنشاء ملف .env
cat > .env << 'EOF'
# Database (استخدم RDS أو Docker postgres)
DATABASE_URL=postgresql://garfix:STRONG_PASSWORD@localhost:5432/garfix?schema=public
DATABASE_DIRECT_URL=postgresql://garfix:STRONG_PASSWORD@localhost:5432/garfix?schema=public

# Auth secrets (مولّدة بـ openssl)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)
PAYMENTS_ENC_KEY=$(openssl rand -base64 32)

# App
NODE_ENV=production
FOUNDER_EMAIL=admin@garfix.com
PORT=3000
HOSTNAME=0.0.0.0

# Valkey/Redis
VALKEY_URL=redis://:VALKEY_PASSWORD@localhost:6379
VALKEY_PASSWORD=$(openssl rand -hex 16)

# Optional: AI
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=
EOF

# توليد القيم الحقيقية
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)
PAYMENTS_ENC_KEY=$(openssl rand -base64 32)
VALKEY_PASSWORD=$(openssl rand -hex 16)

# استبدال في .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET|" .env
sed -i "s|PAYMENTS_ENC_KEY=.*|PAYMENTS_ENC_KEY=$PAYMENTS_ENC_KEY|" .env
sed -i "s|VALKEY_PASSWORD=.*|VALKEY_PASSWORD=$VALKEY_PASSWORD|" .env
sed -i "s|VALKEY_URL=.*|VALKEY_URL=redis://:$VALKEY_PASSWORD@localhost:6379|" .env

# عرض المتغيرات (للتحقق)
cat .env
```

### 6. تشغيل المشروع

```bash
# Build + Run
docker-compose up -d --build

# مراقبة الـ logs
docker-compose logs -f app

# التحقق
curl http://localhost:3000/api/health
```

### 7. إعداد Nginx Reverse Proxy (اختياري)

```bash
# Install Nginx
sudo apt install -y nginx

# Create config
sudo cat > /etc/nginx/sites-available/garfix << 'EOF'
server {
    listen 80;
    server_name your-domain.com OR your-ec2-public-ip;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
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

# Enable
sudo ln -s /etc/nginx/sites-available/garfix /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 8. SSL مع Let's Encrypt (اختياري)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## الطريقة 2: AWS RDS + EC2 (للإنتاج)

### 1. إنشاء RDS PostgreSQL

```bash
# من AWS Console:
# 1. RDS → Create Database
# 2. Engine: PostgreSQL 17
# 3. Template: Free tier (أو Production)
# 4. DB instance: db.t3.micro (Free tier)
# 5. Storage: 20 GB
# 6. VPC: نفس VPC بتاع EC2
# 7. Public access: No (أمن)
# 8. Database name: garfix
# 9. Master username: garfix
# 10. Master password: STRONG_PASSWORD
```

### 2. تحديث .env

```bash
# استبدل DATABASE_URL بـ RDS endpoint
DATABASE_URL=postgresql://garfix:STRONG_PASSWORD@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/garfix?schema=public
DATABASE_DIRECT_URL=postgresql://garfix:STRONG_PASSWORD@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/garfix?schema=public
```

### 3. تشغيل migration

```bash
bunx prisma migrate deploy
bunx prisma db push
```

---

## الطريقة 3: AWS App Runner (الأسهل)

```bash
# من AWS Console:
# 1. App Runner → Create service
# 2. Source: GitHub repo → ahmedezzatelsayad/Garfix
# 3. Branch: main
# 4. Build:
#    - Runtime: Node.js 22
#    - Build command: bun install && bunx prisma generate && next build --webpack
#    - Start command: next start -p 3000
# 5. Port: 3000
# 6. Environment variables: (أضف كل المتغيرات من .env)
# 7. Deploy
```

---

## بعد التشغيل: Seed البيانات

```bash
# على EC2
cd Garfix
bun run scripts/seed-minimal.ts

# أو يدوياً
bunx prisma db push
bunx tsx scripts/seed-minimal.ts
```

## التحقق

```bash
# Health check
curl http://localhost:3000/api/health

# يجب أن ترى:
# {"status":"ok","checks":{"db":{"ok":true},...}}
```

## الصيانة

```bash
# Update
git pull origin main
docker-compose up -d --build

# Logs
docker-compose logs -f app

# Restart
docker-compose restart app

# Stop
docker-compose down
```

---

## ملاحظات مهمة

1. **الـ AppShell بيشتغل 100% على Docker/AWS** — مفيش مشاكل hydration
2. **كل الـ 18 module شغّالة** — invoices, clients, accounting, HR, etc.
3. **framer-motion + canvas animations شغّالة** — مش محتاجة pure HTML
4. **Founder panel شغّال** — كل الـ dashboards + charts
5. **E-invoicing شغّال** — 7 دول + webhooks + notifications

## التكلفة الشهرية التقريبية

| المورد | التكلفة |
|--------|---------|
| EC2 t3.medium | ~$30/شهر |
| RDS db.t3.micro | ~$15/شهر (Free tier لـ 12 شهر) |
| EBS 30GB | ~$3/شهر |
| Data transfer | ~$2/شهر |
| **الإجمالي** | **~$50/شهر** (أو $0 في Free tier) |
