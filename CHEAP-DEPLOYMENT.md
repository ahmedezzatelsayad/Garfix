# GarfiX ERP — خيارات النشر الاقتصادية (CHEAP DEPLOYMENT)

> **الهدف**: خيارات رخيصة لإطلاق المشروع وتجربته مع أول 50 عميل بدون ما تكلفك ثروة.

---

## 🏆 الخيارات مرتبة من الأرخص للأنسب

### 1️⃣ Oracle Cloud Free Tier — **مجاني للأبد** (أنصح به للتجربة)

**السيرفر المجاني الدائم من Oracle** — أنصح به بقوة للتجربة الأولى:

| العنصر | القيمة |
|--------|--------|
| CPU | 4 vCPU ARM Ampere A1 |
| RAM | **24 GB** |
| SSD | 200 GB |
| Traffic | 10 TB/شهر |
| **السعر** | **$0/شهر (مجاني للأبد)** |

**الخطوات:**
1. اذهب لـ https://www.oracle.com/cloud/free/
2. أنشئ حساب (تحتاج بطاقة ائتمان للتأكيد لكنها لن تُخصم)
3. اختر Always Free Eligible
4. أنشئ VM Instance: Shape `VM.Standard.A1.Flex` (4 OCPU + 24GB)
5. Image: Ubuntu 22.04
6. افتح_PORTS: 22, 80, 443 في Security List
7. SSH للسيرفر وثبّت Docker

**العيوب:**
- ⚠️ أحياناً Oracle تحذف الحساب إذا لم يُستخدم (سجّل دخول كل أسبوع)
- ⚠️ Datacenter في أمريكا/أوروبا → latency ~150ms للمنطقة العربية
- ⚠️ ARM architecture (تحتاج build منفصل — لكن Docker يدعمها)

---

### 2️⃣ Hetzner Cloud — **الأفضل قيمة/سعر** (أنصح به للإنتاج)

**أرخص خيار مدفوع + datacenter قريب من المنطقة العربية:**

| السيرفر | CPU | RAM | SSD | السعر/شهر |
|---------|-----|-----|-----|-----------|
| **CPX21** | 3 vCPU | 4 GB | 80 GB | ~$8.5 |
| **CPX31** ⭐ | 4 vCPU | 8 GB | 160 GB | ~$17 |
| **CPX41** | 8 vCPU | 16 GB | 240 GB | ~$30 |

**أنصح بـ CPX31 ($17/شهر) للأسباب التالية:**
- ✅ 8GB RAM تكفي: PostgreSQL (2GB) + Valkey (1GB) + Next.js (1GB) + headroom (4GB)
- ✅ Datacenter في Helsinki → latency ~50-70ms للسعودية/مصر/الإمارات
- ✅ 20TB traffic شامل
- ✅ Snapshot يومي تلقائي (+$1.7)
- ✅ دفع بالساعة (تقدر توقف وتشغّل)

**التسجيل**: https://hetzner.cloud/?ref=signup

---

### 3️⃣ Contabo VPS — **الأرخص مطلقاً للمواصفات**

| السيرفر | CPU | RAM | SSD | السعر/شهر |
|---------|-----|-----|-----|-----------|
| **VPS S** | 4 vCPU | 8 GB | 100 GB NVMe | ~$6 |
| **VPS M** | 6 vCPU | 16 GB | 200 GB NVMe | ~$12 |

**العيوب:**
- ⚠️ CPU oversold أحياناً (مش dedicated)
- ⚠️ Datacenter في ألمانيا فقط → latency ~90ms للمنطقة
- ⚠️ Support أبطأ من Hetzner

**التسجيل**: https://contabo.com/en/vps/

---

### 4️⃣ Fly.io — **multi-region + pay-as-you-go**

**ممتاز لو محتاج datacenter في منطقة معينة:**

| الخدمة | المواصفات | السعر/شهر |
|--------|----------|----------|
| shared-cpu-1x | 1 vCPU, 512MB | ~$2 |
| shared-cpu-2x | 2 vCPU, 1GB | ~$5 |
| shared-cpu-4x | 4 vCPU, 2GB | ~$12 |
| **shared-cpu-8x** ⭐ | 8 vCPU, 4GB | ~$24 |
| PostgreSQL (1GB) | مُدار | ~$5 |
| Valkey (512MB) | مُدار | ~$3 |

**المميزات:**
- ✅ Datacenter في سنغافورة (الأقرب للمنطقة بعد البحرين)
- ✅ PostgreSQL + Valkey مُداران (backups تلقائي)
- ✅ Pay-as-you-go (تدفع فقط ما تستخدمه)
- ✅ Git push to deploy

**التسجيل**: https://fly.io/

---

### 5️⃣ خطة النمو المقترحة

```
┌─────────────────────────────────────────────────────────────┐
│ المرحلة 1: التجربة (0-10 عملاء)                            │
│   Oracle Cloud Free (24GB RAM مجاناً)                       │
│   التكلفة: $0/شهر                                           │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 2: الإطلاق (10-50 عميل)                            │
│   Hetzner CPX31 (8GB RAM, $17/شهر)                         │
│   + Domain: $1/شهر                                          │
│   التكلفة: ~$18/شهر                                         │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 3: النمو (50-200 عميل)                             │
│   Hetzner CPX41 (16GB RAM, $30/شهر)                        │
│   + Backups: $3/شهر                                        │
│   التكلفة: ~$33/شهر                                         │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 4: التوسّع (200-1000 عميل)                         │
│   فصل الخدمات:                                              │
│   - EC2 t3.large (App): $35                                │
│   - RDS db.t3.medium (PG): $35                             │
│   - ElastiCache (Valkey): $12                              │
│   التكلفة: ~$82/شهر                                         │
├─────────────────────────────────────────────────────────────┤
│ المرحلة 5: النضج (1000+ عميل)                              │
│   AWS Bahrain (me-south-1) — latency ~15ms                 │
│   التكلفة: $200+/شهر                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 خطوات النشر على Hetzner CPX31 (الأنسب للإطلاق)

### 1. استأجر السيرفر
1. اذهب لـ https://console.hetzner.cloud/
2. New Project → اسمه `garfix`
3. Add Server:
   - Location: **Helsinki** (fi-hel1) ← الأقرب للمنطقة العربية
   - Image: **Ubuntu 24.04**
   - Type: **CPX31** (4 vCPU, 8GB RAM)
   - SSH Key: أضف مفتاحك العام
4. السعر: ~€15.83/شهر

### 2. إعداد الـ DNS
```
A    garfix.yourdomain.com    →  <server-ip>
A    api.yourdomain.com       →  <server-ip>
AAAA garfix.yourdomain.com    →  <server-ipv6>
```

### 3. إعداد السيرفر (SSH)
```bash
# سجّل دخول للسيرفر
ssh root@<server-ip>

# تحديث + تثبيت Docker
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx ufw git

# إعداد الـ firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# استنساخ المشروع
cd /opt
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix

# إعداد البيئة
cp .env.example .env
nano .env
# عدّل:
#   DATABASE_URL=postgresql://garfix:STRONG_PASSWORD@localhost:5432/garfix
#   JWT_SECRET=$(openssl rand -hex 64)
#   JWT_REFRESH_SECRET=$(openssl rand -hex 64)
#   PAYMENTS_ENC_KEY=$(openssl rand -base64 32)
#   FOUNDER_EMAIL=your@email.com
#   FOUNDER_PASSWORD=Your-Strong-Password-2026!
#   DEEPSEEK_API_KEY=sk-your-real-deepseek-key
#   APP_URL=https://garfix.yourdomain.com

# تشغيل الـ migrations + seed
docker compose -f docker-compose.prod.yml run --rm app bunx prisma migrate deploy
docker compose -f docker-compose.prod.yml run --rm app bunx prisma db seed

# تشغيل التطبيق
docker compose -f docker-compose.prod.yml up -d

# التحقق
curl http://localhost:3000/api/health
```

### 4. إعداد Nginx + SSL
```bash
# أنشئ /etc/nginx/sites-available/garfix.conf
cat > /etc/nginx/sites-available/garfix.conf << 'EOF'
server {
    listen 80;
    server_name garfix.yourdomain.com;

    # Rate limiting
    limit_req zone=api burst=20 nodelay;

    # Upload size (for invoice files)
    client_max_body_size 50M;

    # Main app
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

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Rate limit zone
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
EOF

ln -s /etc/nginx/sites-available/garfix.conf /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# SSL certificate (مجاني من Let's Encrypt)
certbot --nginx -d garfix.yourdomain.com --non-interactive --agree-tos -m your@email.com
```

### 5. التحقق من التشغيل
```bash
# الحالة
docker compose -f docker-compose.prod.yml ps

# اللوجات
docker compose -f docker-compose.prod.yml logs -f app

# الـ health check
curl https://garfix.yourdomain.com/api/health
# Expected: {"status":"ok","db":{"ok":true,"latencyMs":2},...}
```

### 6. تسجيل الدخول كـ Founder
1. اذهب لـ https://garfix.yourdomain.com/login
2. سجّل دخول بـ:
   - Email: `your@email.com` (نفس اللي في FOUNDER_EMAIL)
   - Password: `Your-Strong-Password-2026!`
3. هتدخل تلقائياً على لوحة المؤسس (founder panel)
4. **أول مهمة**: غيّر الباسورد من الإعدادات

### 7. إضافة مفاتيح DeepSeek
1. من لوحة المؤسس، اذهب لـ: **API Key Pool**
2. أضف مفاتيح DeepSeek (تقدر تضيف غير محدود):
   - Provider: `deepseek`
   - Model: `deepseek-chat`
   - API Key: `sk-...` (مفتاحك من https://platform.deepseek.com/api_keys)
   - RPM Limit: `60` (الافتراضي)
3. النظام هيوزّع المفاتيح round-robin على كل الشركات

---

## 💰 مقارنة التكلفة الإجمالية الشهرية

| الخيار | السيرفر | Domain | SSL | Backups | **الإجمالي** |
|--------|---------|--------|-----|---------|-------------|
| Oracle Free | $0 | $1 | مجاني | يدوي | **$1/شهر** |
| Hetzner CPX21 | $8.5 | $1 | مجاني | $1 | **$10.5/شهر** |
| **Hetzner CPX31** ⭐ | $17 | $1 | مجاني | $1.7 | **$20/شهر** |
| Contabo VPS M | $12 | $1 | مجاني | $1 | **$14/شهر** |
| Fly.io (8 vCPU) | $24 | $1 | مجاني | شامل | **$25/شهر** |

**ملاحظة**: SSL مجاني عبر Let's Encrypt. Cloudflare CDN مجاني.

---

## ⚠️ تحذيرات مهمة

### مشكلة Vercel (مهم!)
المشروع **لا يعمل على Vercel** حالياً بسبب:
```
The Edge Function "_middleware" is referencing unsupported modules:
- node:crypto, node:fs, node:http, node:net, node:stream, ...
```

**الحل**: استخدم VPS (Hetzner/Contabo/Oracle) — المشروع مصمّم لـ Docker.

### الـ DeepSeek API Key
- **احصل عليه من**: https://platform.deepseek.com/api_keys
- **السعر**: $0.14 / 1M input tokens
- **الحد الأقصى**: 60 RPM لكل مفتاح (لذلك أضف مفاتيح متعددة)
- **التكلفة المتوقعة لـ 50 عميل**: ~$5-10/شهر (يعتمد على الاستخدام)

### الـ Database Backup
**مهم جداً**: اعمل backup يومي لـ PostgreSQL:
```bash
# أضف لـ crontab:
0 3 * * * docker compose -f /opt/Garfix/docker-compose.prod.yml exec -T db pg_dump -U garfix garfix | gzip > /backups/garfix-$(date +\%Y\%m\%d).sql.gz
# احتفظ بآخر 7 أيام فقط:
0 4 * * * find /backups -name "garfix-*.sql.gz" -mtime +7 -delete
```

---

## 🆘 الدعم

- **المشاكل التقنية**: https://github.com/ahmedezzatelsayad/Garfix/issues
- **التوثيق الكامل**: README.md
- **خطوات الطوارئ**: docs/RUNBOOK.md
