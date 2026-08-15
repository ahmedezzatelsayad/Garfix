# GarfiX EOS — AWS Production Deployment v2

> هذا الدليل مبني على الكود الحالي في الريبو (commit `3915519`) ومطابق لـ:
> `Dockerfile` + `docker-compose.yml` + `package.json` + `prisma/schema.prisma` + `instrumentation.ts` + `next.config.ts`

---

## Architecture

```
Internet
   │
   ▼
Route 53 / Cloudflare (DNS + DDoS)
   │
   ▼
Nginx :443 (HTTPS, Let's Encrypt)
   │
   ▼
GarfiX App :3000 (Docker, internal only)
   │
   ├── RDS PostgreSQL (Private subnet, same VPC)
   ├── Valkey (Docker container, internal only)
   ├── BullMQ Workers (same container)
   ├── AI Workers (same container)
   └── External APIs (OpenRouter, DeepSeek, etc.)
```

**قواعد الأمان:**
- Port 3000 **لا** يُفتح للعالم — فقط Nginx يصل إليه
- Port 22 (SSH) — من IP محدد فقط
- RDS في private subnet — لا وصول من الإنترنت
- Valkey داخل Docker network — لا وصول خارجي
- لا `cat .env` في أي خطوة — الأسرار تأتي من AWS SSM / Secrets Manager

---

## المتطلبات

| المورد | المواصفات | ملاحظة |
|--------|-----------|-------|
| EC2 | t3.large (2 vCPU, 8 GB RAM) | الحد الأدنى للإنتاج مع BullMQ + AI workers |
| RDS | db.t3.medium (2 vCPU, 4 GB RAM) | PostgreSQL 17, private subnet |
| EBS | 50 GB gp3 | للـ Docker images + logs |
| Security Group | 3 قواعد فقط | SSH(22) + HTTP(80) + HTTPS(443) |

> **t3.medium (4GB) قد يكفي كـ staging**، لكن الإنتاج يحتاج t3.large لأن GarfiX يشغل: Next.js + Prisma + BullMQ + Valkey + AI workers + WhatsApp processing في نفس الـ instance.

---

## 1. إعداد البنية التحتية (Infrastructure)

### 1.1 إنشاء VPC + Subnets

```bash
# من AWS Console أو CLI:
# VPC: 10.0.0.0/16
# Public subnet: 10.0.1.0/24 (EC2 + Nginx)
# Private subnet: 10.0.2.0/24 (RDS)
# Internet Gateway: مرفق بالـ public subnet
# NAT Gateway: مرفق بالـ public subnet (لـ RDS updates)
```

### 1.2 إنشاء RDS PostgreSQL

```bash
aws rds create-db-instance \
  --db-instance-identifier garfix-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 17 \
  --master-username garfix \
  --master-user-password "$(openssl rand -base64 24)" \
  --allocated-storage 50 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-xxxxxxxx \
  --db-subnet-group-name garfix-private-subnet \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --multi-az
```

> **احفظ الـ password في AWS Secrets Manager فوراً — لا تطبعه في الـ terminal.**

### 1.3 إنشاء EC2

```bash
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \
  --instance-type t3.large \
  --key-name your-key \
  --security-group-ids sg-xxxxxxxx \
  --subnet-id subnet-xxxxxxxx \
  --block-device-mappings DeviceName=/dev/xvda,Ebs={VolumeSize=50,VolumeType=gp3} \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=garfix-prod}]"
```

### 1.4 Security Group Rules

```bash
# SSH — من IP محدد فقط
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 22 --cidr YOUR.IP.ADDRESS/32

# HTTP — من أي مكان (Nginx redirect to HTTPS)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# HTTPS — من أي مكان
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# ⚠️ لا تفتح port 3000 للعالم — Nginx يصل إليه داخلياً
```

---

## 2. إعداد EC2

### 2.1 الاتصال وتثبيت المتطلبات

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# تثبيت Docker Compose v2
sudo apt install -y docker-compose-plugin

# تثبيت Nginx
sudo apt install -y nginx

# تثبيت Certbot (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# تثبيت AWS CLI (لـ SSM Secrets)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
sudo apt install -y unzip && unzip awscliv2.zip
sudo ./aws/install

# Logout + login for docker group
exit
```

### 2.2 استنساخ المشروع

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip

git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix
```

---

## 3. إدارة الأسرار (Secrets Management)

### 3.1 تخزين الأسرار في AWS SSM Parameter Store

```bash
# ⚠️ لا تطبع الأسرار في الـ terminal — استخدم --query فقط للتحقق من الاسم

aws ssm put-parameter --name "/garfix/prod/database_url" \
  --value "postgresql://garfix:PASSWORD@RDS-ENDPOINT:5432/garfix?schema=public" \
  --type SecureString --region us-east-1

aws ssm put-parameter --name "/garfix/prod/jwt_secret" \
  --value "$(openssl rand -hex 64)" \
  --type SecureString --region us-east-1

aws ssm put-parameter --name "/garfix/prod/jwt_refresh_secret" \
  --value "$(openssl rand -hex 64)" \
  --type SecureString --region us-east-1

aws ssm put-parameter --name "/garfix/prod/payments_enc_key" \
  --value "$(openssl rand -base64 32)" \
  --type SecureString --region us-east-1

aws ssm put-parameter --name "/garfix/prod/valkey_password" \
  --value "$(openssl rand -hex 16)" \
  --type SecureString --region us-east-1

aws ssm put-parameter --name "/garfix/prod/founder_email" \
  --value "admin@garfix.com" \
  --type SecureString --region us-east-1
```

### 3.2 توليد ملف .env من SSM (بدون طباعة الأسرار)

```bash
#!/bin/bash
# scripts/fetch-secrets.sh — لا تطبع الأسرار
set -euo pipefail

REGION="us-east-1"
ENV_FILE="/home/ubuntu/Garfix/.env"

# جلب الأسرار من SSM وكتابتها في .env مباشرة
fetch() {
  aws ssm get-parameter \
    --name "/garfix/prod/$1" \
    --with-decryption \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text
}

cat > "$ENV_FILE" << EOF
DATABASE_URL=$(fetch database_url)
DATABASE_DIRECT_URL=$(fetch database_url)
JWT_SECRET=$(fetch jwt_secret)
JWT_REFRESH_SECRET=$(fetch jwt_refresh_secret)
PAYMENTS_ENC_KEY=$(fetch payments_enc_key)
VALKEY_PASSWORD=$(fetch valkey_password)
VALKEY_URL=valkey://:$(fetch valkey_password)@valkey:6379
FOUNDER_EMAIL=$(fetch founder_email)
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
SESSION_REGISTRY_ENFORCED=true
EOF

chmod 600 "$ENV_FILE"
echo "✓ .env created from SSM (secrets not printed)"
```

```bash
chmod +x scripts/fetch-secrets.sh
./scripts/fetch-secrets.sh
# ✓ .env created from SSM (secrets not printed)
```

---

## 4. Prisma Migration (Production Strategy)

### 4.1 Migration Strategy

```bash
# ⚠️ الإنتاج: استخدم migrate deploy فقط — لا تستخدم db push
# migrate deploy يطبق migrations المعتمدة فقط (من prisma/migrations/)
# db push للـ development فقط (يعدل الـ schema مباشرة بدون migration files)

cd /home/ubuntu/Garfix

# توليد Prisma Client (يتم تلقائياً عبر postinstall في Docker build)
bunx prisma generate

# تطبيق migrations المعتمدة
bunx prisma migrate deploy

# التحقق من حالة الـ migrations
bunx prisma migrate status

# ❌ لا تشغل: bunx prisma db push
# ❌ لا تشغل: bunx prisma migrate reset
```

### 4.2 Seed (مرّة واحدة فقط)

```bash
# تشغيل seed للبيانات الأولية (founder user + company + accounts)
bunx tsx scripts/seed-minimal.ts

# التحقق من البيانات (بدون طباعة passwords)
psql $DATABASE_URL -c "SELECT email, role, email_verified FROM app_users;"
psql $DATABASE_URL -c "SELECT slug, name, country FROM companies LIMIT 5;"
```

---

## 5. تشغيل المشروع (Docker)

### 5.1 Build + Run

```bash
cd /home/ubuntu/Garfix

# بناء الـ Docker image
docker compose build

# تشغيل الخدمات (app + valkey فقط — RDS منفصل)
docker compose up -d

# مراقبة الـ logs
docker compose logs -f app
```

### 5.2 التحقق

```bash
# Health check (داخلي فقط — port 3000 غير مكشوف)
curl http://localhost:3000/api/health

# يجب أن ترى:
# {"status":"ok","checks":{"db":{"ok":true},"valkey":{"ok":true},...}}
```

---

## 6. Nginx Reverse Proxy + HTTPS

### 6.1 إعداد Nginx

```bash
sudo cat > /etc/nginx/sites-available/garfix << 'EOF'
server {
    listen 80;
    server_name garfix.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name garfix.yourdomain.com;

    # SSL certificates (سيتم إنشاؤها بواسطة certbot)
    ssl_certificate /etc/letsencrypt/live/garfix.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/garfix.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Upload limit
    client_max_body_size 50M;

    # Next.js app (internal only — port 3000 not exposed to internet)
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
        proxy_read_timeout 120s;
    }

    # Static files caching
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # API no-cache
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/garfix /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 6.2 SSL مع Let's Encrypt

```bash
sudo certbot --nginx -d garfix.yourdomain.com \
  --non-interactive --agree-tos --email admin@garfix.com \
  --redirect

# Auto-renewal (يُضاف تلقائياً بواسطة certbot)
sudo systemctl status certbot.timer
```

---

## 7. Docker Compose (Production)

ملف `docker-compose.prod.yml` مُحدث للإنتاج:

```yaml
# استخدم: docker compose -f docker-compose.prod.yml up -d
services:
  valkey:
    image: valkey/valkey:8.1
    restart: unless-stopped
    networks: [garfix-net]
    command: >
      valkey-server
      --requirepass ${VALKEY_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    volumes: [valkey-data:/data]
    healthcheck:
      test: ["CMD", "valkey-cli", "-a", "${VALKEY_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: { memory: 768M }

  app:
    build: .
    restart: unless-stopped
    # ⚠️ لا نفتح port 3000 — Nginx يصل داخلياً عبر 127.0.0.1:3000
    network_mode: host
    env_file: .env
    volumes: [app-storage:/app/storage]
    depends_on:
      valkey: { condition: service_healthy }
    deploy:
      resources:
        limits: { memory: 4G, cpus: "2.0" }
        reservations: { memory: 1G, cpus: "0.5" }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }

networks:
  garfix-net:
    driver: bridge

volumes:
  valkey-data:
  app-storage:
```

> **ملاحظة**: `network_mode: host` يسمح لـ Nginx بالوصول لـ port 3000 داخلياً
> بدون فتحه للإنترنت. RDS يُوصل إليه مباشرة عبر VPC.

---

## 8. CI/CD مع GitHub Actions

ملف `.github/workflows/deploy-aws.yml`:

```yaml
name: Deploy to AWS EC2

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t garfix:${{ github.sha }} .

      - name: Save image
        run: docker save garfix:${{ github.sha }} | gzip > garfix.tar.gz

      - name: Copy to EC2
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          source: garfix.tar.gz
          target: /home/ubuntu/

      - name: Deploy on EC2
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /home/ubuntu/Garfix
            git pull origin main
            docker load < /home/ubuntu/garfix.tar.gz
            docker compose -f docker-compose.prod.yml up -d --build
            sleep 10
            # Health check
            curl -sf http://localhost:3000/api/health | jq .status
            if [ $? -ne 0 ]; then
              echo "❌ Health check failed — rolling back"
              docker compose -f docker-compose.prod.yml restart app
              exit 1
            fi
            echo "✅ Deploy successful"
            rm /home/ubuntu/garfix.tar.gz
```

> **متطلبات GitHub Secrets**:
> - `EC2_HOST` — public IP للـ EC2
> - `EC2_SSH_KEY` — private key للـ SSH

---

## 9. Monitoring + Health Checks

### 9.1 Health Endpoint

GarfiX لديه `/api/health` يتحقق من:
- PostgreSQL (`SELECT 1`)
- Valkey (`PING`)
- Memory usage
- Queue depths
- Disk space

```bash
# Health check script (لـ cron أو monitoring)
#!/bin/bash
HEALTH=$(curl -sf http://localhost:3000/api/health | jq -r '.status')
if [ "$HEALTH" != "ok" ]; then
  # إرسال تنبيه (SNS, email, Slack)
  aws sns publish --topic-arn arn:aws:sns:us-east-1:XXX:garfix-alerts \
    --subject "GarfiX Health Check FAILED" \
    --message "Status: $HEALTH"
  # Restart container
  docker compose -f docker-compose.prod.yml restart app
fi
```

### 9.2 CloudWatch Logs (اختياري)

```bash
# تثبيت CloudWatch agent
sudo apt install -y amazon-cloudwatch-agent

# إعداد logs collection
sudo cat > /opt/aws/amazon-cloudwatch-agent/bin/config.json << 'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/nginx/access.log",
            "log_group_name": "garfix/nginx-access",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/var/log/nginx/error.log",
            "log_group_name": "garfix/nginx-error",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json -s
```

---

## 10. Backups

### 10.1 RDS Automated Backups

```bash
# RDS automated backups مفعّلة تلقائياً (7 days retention)
# لزيادة المدة:
aws rds modify-db-instance \
  --db-instance-identifier garfix-prod \
  --backup-retention-period 30
```

### 10.2 Manual Snapshot

```bash
# قبل أي deployment كبير
aws rds create-db-snapshot \
  --db-instance-identifier garfix-prod \
  --db-snapshot-identifier garfix-prod-$(date +%Y%m%d)
```

### 10.3 Restore

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier garfix-prod-restored \
  --db-snapshot-identifier garfix-prod-20260808
```

---

## 11. الصيانة + التحديثات

### تحديث الكود

```bash
cd /home/ubuntu/Garfix
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
sleep 10
curl -sf http://localhost:3000/api/health | jq .status
```

### Rollback

```bash
# العودة لـ commit سابق
git log --oneline -5
git checkout <previous-commit>
docker compose -f docker-compose.prod.yml up -d --build
```

### تطبيق Prisma Migration جديد

```bash
# في development:
bunx prisma migrate dev --name descriptive_name

# في production (على EC2):
git pull origin main
bunx prisma migrate deploy  # ← فقط هذا، لا db push
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 12. الفصل بين البيئات (Staging vs Production)

| العنصر | Staging | Production |
|--------|---------|------------|
| EC2 | t3.medium | t3.large+ |
| RDS | db.t3.micro (Free tier) | db.t3.medium+ (Multi-AZ) |
| Branch | `staging` | `main` |
| Secrets | `/garfix/staging/*` | `/garfix/prod/*` |
| Domain | staging.garfix.app | garfix.app |
| SSL | Let's Encrypt | Let's Encrypt (أو ACM) |
| Backups | 1 day | 30 days |
| Monitoring | Basic | CloudWatch + alerts |

---

## Checklist قبل الإنتاج

- [ ] RDS في private subnet (لا publicly accessible)
- [ ] Security Group: لا port 3000 مكشوف
- [ ] `.env` بصلاحيات `600` (chmod 600)
- [ ] لا `cat .env` في أي script
- [ ] `prisma migrate deploy` فقط (لا `db push`)
- [ ] Nginx HTTPS مفعّل
- [ ] HSTS header مفعّل
- [ ] RDS automated backups (7+ days)
- [ ] Health check script + cron
- [ ] GitHub Actions deploy workflow يعمل
- [ ] Rollback strategy مُختبرة
- [ ] CloudWatch logs (أو بديل) مُفعّل
- [ ] SNS alerts للـ health check failures
