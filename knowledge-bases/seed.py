"""
seed.py — Uploads regulation PDFs to Gradient Knowledge Bases.

Usage:
    DIGITALOCEAN_API_TOKEN=xxx python knowledge-bases/seed.py

Creates KBs if they don't exist. Prints IDs to add to .env.
"""

import os
import glob
import sys

try:
    from gradient import Gradient
except ImportError:
    print("pip install gradient")
    sys.exit(1)

sdk = Gradient(access_token=os.environ["DIGITALOCEAN_API_TOKEN"])

KB_CONFIGS = [
    {
        "env": "GRADIENT_KB_DORA_ID",
        "path": "knowledge-bases/dora/*.pdf",
        "name": "GradientGuard DORA",
        "description": "DORA Regulation EU 2022/2554 and related RTS/ITS",
    },
    {
        "env": "GRADIENT_KB_NIS2_ID",
        "path": "knowledge-bases/nis2/*.pdf",
        "name": "GradientGuard NIS2",
        "description": "NIS2 Directive EU 2022/2555",
    },
    {
        "env": "GRADIENT_KB_GDPR_ID",
        "path": "knowledge-bases/gdpr/*.pdf",
        "name": "GradientGuard GDPR",
        "description": "GDPR Articles 32 and 35 (Security & DPIA)",
    },
    {
        "env": "GRADIENT_KB_MAS_ID",
        "path": "knowledge-bases/mas_trm/*.pdf",
        "name": "GradientGuard MAS TRM",
        "description": "MAS Technology Risk Management Guidelines 2021",
    },
]

new_ids: list[tuple[str, str]] = []

for cfg in KB_CONFIGS:
    kb_id = os.environ.get(cfg["env"])
    if not kb_id:
        kb = sdk.knowledge_bases.create(
            name=cfg["name"],
            description=cfg["description"],
        )
        kb_id = kb.id
        print(f"Created KB: {cfg['name']} → {kb_id}")
        new_ids.append((cfg["env"], kb_id))
    else:
        print(f"Using existing KB: {cfg['name']} → {kb_id}")

    pdfs = glob.glob(cfg["path"])
    if not pdfs:
        print(f"  ⚠️  No PDFs found at {cfg['path']} — skipping upload")
        continue

    for pdf_path in pdfs:
        print(f"  Uploading: {pdf_path}")
        with open(pdf_path, "rb") as f:
            sdk.knowledge_bases.upload(
                knowledge_base_id=kb_id,
                file=f,
                filename=os.path.basename(pdf_path),
            )

if new_ids:
    print("\nAdd these to your .env:")
    for env_key, kb_id in new_ids:
        print(f"  {env_key}={kb_id}")

print("\nDone. Knowledge bases seeded.")
