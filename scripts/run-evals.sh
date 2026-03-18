#!/bin/bash
set -e

echo "============================================"
echo "  GradientGuard — Running Agent Evaluations"
echo "============================================"

echo ""
echo "→ Evaluating ComplianceCounsel..."
cd packages/agents/compliance_counsel
gradient agent evaluate \
    --test-case-name "DORA Q&A Evaluation" \
    --dataset-file eval_dataset.csv \
    --categories correctness,context_quality
cd ../../..

echo ""
echo "→ Evaluating DORASentinel..."
cd packages/agents/dora_sentinel
gradient agent evaluate \
    --test-case-name "Incident Detection Evaluation" \
    --dataset-file eval_dataset.csv \
    --categories correctness
cd ../../..

echo ""
echo "Evaluation complete. Check Gradient console for results."
