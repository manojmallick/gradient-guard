#!/bin/bash
set -e

echo "============================================"
echo "  GradientGuard — Deploy Agents to Gradient ADK"
echo "============================================"

AGENTS=(dora_sentinel evidence_forge remediation_advisor compliance_counsel)

for agent in "${AGENTS[@]}"; do
    echo ""
    echo "→ Deploying $agent..."
    cd "packages/agents/$agent"
    gradient agent deploy
    cd ../../..
done

echo ""
echo "============================================"
echo "  All agents deployed!"
echo "  Update .env with the agent URLs shown above."
echo "============================================"
