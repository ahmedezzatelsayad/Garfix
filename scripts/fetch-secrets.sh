#!/bin/bash
# scripts/fetch-secrets.sh — Fetch secrets from AWS SSM without printing them
# Usage: ./scripts/fetch-secrets.sh
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENV_FILE="${ENV_FILE:-.env}"

# Verify AWS CLI is configured
if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not installed. Install: sudo ./aws/install"
  exit 1
fi

# Verify SSM access
aws ssm describe-parameters --region "$REGION" --query 'Parameters[0].Name' --output text &> /dev/null || {
  echo "❌ Cannot access SSM — check AWS credentials"
  exit 1
}

fetch() {
  aws ssm get-parameter \
    --name "/garfix/prod/$1" \
    --with-decryption \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || {
    echo "❌ Secret '/garfix/prod/$1' not found in SSM"
    exit 1
  }
}

# Write .env without printing any values
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
NEXT_TELEMETRY_DISABLED=1
EOF

chmod 600 "$ENV_FILE"
echo "✓ .env created from AWS SSM Parameter Store (secrets not printed)"
