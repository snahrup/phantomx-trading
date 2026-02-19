---
id: kb-1771011721652-qjrf
title: Drawdown Recovery Protocol
category: risk-management
tags: ["drawdown", "position-sizing", "stop-loss", "low-volatility", "overtrading"]
source: ai
created: 2026-02-13T19:42:01.652Z
updated: 2026-02-13T19:42:01.652Z
---
**Trigger Levels & Responses (monitored by Sentinel Agent):**

| Drawdown | Action | Behavioral Risk |
|----------|--------|-----------------|
| 5% | Reduce position sizes by 25%. Review last 10 trades for pattern violations. | Revenge trading and FOMO entries spike at this level. |
| 10% | Reduce position sizes by 50%. Switch to A+ setups only (EMA Ribbon confluences). | Overtrading frequency typically doubles here. |
| 15% | Pause live trading for 24 hours. Full portfolio review. Only paper trade. | Emotional decision-making peaks. |
| 20% | Full stop. No trading until a written plan is reviewed and the drawdown cause is identified. | Capital preservation mode. |

**Recovery Sizing:** After a drawdown > 10%, do not return to full size immediately. Scale back in over 5 winning trades: 50% → 60% → 70% → 80% → 100%. Use the Kelly framework with an additional 0.5x multiplier during recovery.

**Psychological Check:** The AI must ask "Are you trading to recover losses or because there's a genuine setup?" before any entry during an active drawdown > 5%. Cross-reference with the overtrading learning — low-volatility periods during drawdown are the highest-risk combination for account destruction.

**Integration:** Sentinel Agent monitors drawdown in real-time. When thresholds are hit, it signals the intervention system, which cross-references against the revenge trading and FOMO learnings to determine if the current behavior matches a documented pattern.
