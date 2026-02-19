---
id: kb-1771014742985-ziaw
title: Post-Kill-Switch Revenge Entry on GMT
category: learnings
tags: ["revenge-trading", "kill-switch", "position-sizing", "GMT", "drawdown"]
source: ai
created: 2026-02-13T20:32:22.985Z
updated: 2026-02-13T20:32:22.985Z
---
**Pattern:** revenge-trading
**Evidence:** Daily loss limit kill switch fired on GUN at 2:29 PM on 2/13/2026. User then opened a GMT long with ~31x effective leverage ($4,091 notional on $131.67 account) with liquidation only 2.3% from entry.
**Impact:** Entire remaining account at risk — liquidation at $0.01256 is one bad candle away from current price $0.01285. If liquidated, estimated loss of $50-80+ on a $131 account.
**Recommendation:** After a kill switch or daily loss limit event, STOP TRADING FOR THE DAY. No exceptions. The kill switch exists for a reason — opening a new position immediately defeats its purpose. Implement a mandatory 4-hour cooldown after any kill switch event.
