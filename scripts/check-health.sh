#!/bin/bash
# Usage:
#   Local:       bash scripts/check-health.sh
#   Production:  API_URL=https://gradient-guard-api.ondigitalocean.app bash scripts/check-health.sh
set -e

echo "============================================"
echo "  GradientGuard Health Check"
echo "============================================"

API_URL="${API_URL:-${NEXT_PUBLIC_API_URL:-http://localhost:3001}}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
FAIL=0

# Check web dashboard
echo ""
echo "→ Web dashboard ($WEB_URL)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL" || echo "000")
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "307" || "$HTTP_CODE" == "308" ]]; then
  echo "  ✅ Web responding (HTTP $HTTP_CODE)"
else
  echo "  ❌ Web unreachable (HTTP $HTTP_CODE)"
  FAIL=1
fi

echo ""
echo "→ API health ($API_URL/health)..."
if curl -sf "$API_URL/health" | python3 -m json.tool; then
  echo "  ✅ API healthy"
else
  echo "  ❌ API unreachable"
  FAIL=1
fi

AGENTS=(
    "DORASentinel:${GRADIENT_AGENT_URL_SENTINEL}"
    "EvidenceForge:${GRADIENT_AGENT_URL_EVIDENCE}"
    "RemediationAdvisor:${GRADIENT_AGENT_URL_REMEDIATION}"
    "ComplianceCounsel:${GRADIENT_AGENT_URL_COUNSEL}"
)

for entry in "${AGENTS[@]}"; do
    name="${entry%%:*}"
    url="${entry##*:}"
    if [[ -z "$url" || "$url" == "http://localhost:"* ]]; then
        echo "  ⚠️  $name URL not set / is local — skipping"
        continue
    fi
    echo ""
    echo "→ $name ($url/health)..."
    if curl -sf "$url/health" | python3 -m json.tool; then
      echo "  ✅ $name healthy"
    else
      echo "  ❌ $name unreachable"
      FAIL=1
    fi
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ All health checks passed."
else
  echo "❌ One or more health checks failed."
  exit 1
fi
echo "============================================"
