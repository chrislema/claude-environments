---
description: Make and report a deployment decision from evidence, then verify the result if shipping.
argument-hint: [environment]
---

Handle deployment for the requested environment.

Then:

1. Use the Deployer agent.
2. Apply `skills/testing/release-gate.md` before shipping.
3. Refuse deployment if critical evidence is missing.
4. If deployment proceeds, verify the result directly.
5. Use `templates/deployment-report.md`.
