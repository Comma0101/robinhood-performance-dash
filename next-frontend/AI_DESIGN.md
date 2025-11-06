# AI Integration Design

## 1. Overview
- **Purpose**: Introduce guided AI capabilities that improve traders’ day-to-day decision making, capture qualitative insights, and surface actionable context.
- **Scope**: Directional/ICT guidance, news-driven analysis, journal intelligence, conversational access to portfolio data, proactive alerts, and supporting infrastructure.
- **Non-goals**: Fully automated execution, unmanaged third-party news feeds, or unverified trading signals.

## 2. Target Users & Jobs-to-be-Done
| Persona | Key JTBD | Pain Points Today |
| --- | --- | --- |
| Active Day Trader | “What’s the likely intraday bias and ICT setup?” | Scattered sources, subjective bias, slow research. |
| Swing Trader | “Summarize macro/news impact on my portfolio.” | Overload of headlines, hard to map to positions. |
| Self-reviewer | “What did I do last week and how can I improve?” | Manual journals, hard to spot patterns and mistakes. |
| New Strategy Builder | “Is my idea viable based on historical trades?” | Requires manual backtests and spreadsheet work. |

## 3. Core AI Use Cases
1. **Directional & ICT Assistant** – Predict intraday direction, highlight liquidity pools, and annotate charts with FVG/SMT signals plus confidence scores.
2. **News & Macro Copilot** – Cluster headlines, tag relevance to open positions, generate impact summaries, and schedule follow-ups.
3. **Journal Intelligence** – Auto-tag entries, surface psychology/risk breakdowns, suggest playbook tweaks, and draft daily retros.
4. **Narrative Analytics** – Convert quantitative dashboards into story-form briefs and weekly deltas.
5. **Strategy Sandbox** – Rapid backtest heuristics based on natural-language strategy definitions and trade history.
6. **Conversational Query Layer** – Natural-language search across trades, notes, and metrics via the Command Palette.
7. **Proactive Alerts & Automations** – Triggered notifications when AI detects conditions matching user-defined playbooks; option to pre-fill journal entries.
8. **Risk & Psychology Coaching** – Detect rule breaches (oversizing, revenge trading) and offer cooldowns or reminders.

## 4. UX & Placement Strategy
- **AI Command Center (Dedicated Tab)**: Daily briefing with directional call, ICT outlook, news digest, and recent journal insights.
- **Contextual AI Panels**:
  - *Charts*: Toggleable overlay for AI annotations + “Explain this move” prompt.
  - *Calendar/Journal*: Inline AI draft suggestions, auto-summary of highlighted day.
  - *Insights Dashboard*: AI cards that interpret anomalies, only when insight is available.
- **Global Command Palette Enhancements**: Surface AI-suggested queries and follow-up prompts, mark results with an AI badge.
- **Interaction Modalities**: Chat-like copilot panel, quick action buttons, and inline tooltips. Guarantee deterministic data is never obscured.

## 5. Interaction Flows
### 5.1 Morning Session Brief
1. User opens AI Command Center.
2. System pulls latest market data, news, and user positions.
3. Directional assistant outputs trend bias + key ICT levels.
4. News copilot summarizes top three relevant headlines.
5. User marks focus assets and pins/archives the session brief.

### 5.2 Intraday Support
1. Chart overlay monitors live ticks.
2. When conditions match playbook, AI annotates with explanation + risk suggestions.
3. User can request “confidence explanation” → AI shows supporting trades, news, or imbalance data.

### 5.3 Post-market Reflection
1. AI drafts journal summary based on fills, P&L, and notes.
2. User edits/approves, AI tags error types and positive habits.
3. Feedback stored for future personalization.

## 6. Data & Integration Architecture
- **Sources**: Historical and real-time trades (internal API), market data feeds, macro/news APIs, journal notes, user preferences.
- **Pipelines**:
  - Feature store for intraday features (VWAP, liquidity pools, time-of-day stats).
  - ETL for news ingestion with relevance labeling.
  - Journal text pre-processing (embeddings for similarity and retrieval).
- **Services**:
  - `ai-orchestrator`: handles reasoning chains, context assembly, and prompt templates.
  - `insight-service`: deterministic calculations reused by both UI and AI modules.
  - `feedback-service`: stores user ratings, corrections, and telemetry.

## 7. Model Strategy
- **Directional Model**: Gradient boosted or transformer-based time-series model specialized on instrument; optionally fine-tune with ICT-labeled data.
- **LLM Layer**: Use retrieval-augmented generation (RAG) with curated context. Separate prompt suites for news analysis, journal suggestions, and strategy summarization.
- **Annotation Agent**: Tensor-based detection (FVG, liquidity peaks) feeding overlay service.
- **Evaluation**: Backtesting dashboards, live shadow mode, human acceptance scoring, bias/fairness checks.

## 8. Trust, Safety, and Transparency
- Label AI outputs with confidence levels (`Live`, `Preview`, `Experimental`).
- “Why this insight?” drawers showing raw metrics, model version, and timestamp.
- User controls: disable specific AI modules, manage data usage, export conversation logs.
- Regulatory considerations: disclaimers, data retention policies, anonymization for training, secure handling of brokerage info.

## 9. Telemetry & Feedback Loop
- Metrics: usage per module, opt-out rates, conversions (e.g., AI suggestion → trade), sentiment from feedback.
- Instrumentation: event logging with trace IDs linking suggestion to downstream actions.
- Continuous improvement: weekly review of low-rated responses to adjust prompts/models.

## 10. Rollout Plan
1. **Alpha**: Internal testers + small beta group; focus on Command Center and journal intelligence; run in read-only recommendation mode.
2. **Beta**: Expand to news copilot and chart annotations; add feedback UI.
3. **GA**: Unlock automations and proactive alerts; integrate with notifications infra.
4. **Future Enhancements**: Strategy sandbox, auto-optimization, third-party brokerage connectors.

## 11. Open Questions
- Data licensing for real-time news and historical tick data.
- Preferred model hosting (in-house vs managed service) and latency budget.
- Governance: who curates playbooks / ICT heuristics? cadence for human review?
- Personalization: how far can we tailor suggestions without risking overfitting to bad habits?
- Monetization: is AI a premium add-on or core feature?

## 12. Next Steps
- Confirm file location (`next-frontend/AI_DESIGN.md` or `/docs/ai/`).
- Align stakeholders on MVP feature set (directional assistant vs journal intelligence).
- Define data availability and compliance constraints.
- Produce low-fi wireframes for AI Command Center and contextual panels.
- Kick off technical spike to validate model feasibility & latency.

