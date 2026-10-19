# MCP Registry Submission Guide

Ready-to-paste content for each registry. Submit in this order.

---

## 1. Glama (fastest — auto-indexes)

**URL:** https://glama.ai/mcp/servers → click "Add Server"

**What to enter:** Just paste the GitHub repo URL:
```
https://github.com/Ashaw19/agentrunway-web
```

Glama auto-scans, extracts metadata, and assigns quality grades. No manual review needed.

---

## 2. PulseMCP (auto-ingests weekly)

**URL:** https://www.pulsemcp.com/submit

**What to enter:** Paste the URL:
```
https://github.com/Ashaw19/agentrunway-web
```

Or link directly to the MCP function directory:
```
https://github.com/Ashaw19/agentrunway-web/tree/main/apps/web/supabase/functions/mcp-server
```

PulseMCP indexes entries within ~1 week.

---

## 3. mcp.so (GitHub issue)

**URL:** https://mcp.so/submit (routes to a GitHub issue)

**Title:**
```
Add Agent Runway — Canadian Real Estate Business Analytics MCP Server
```

**Body:**
```markdown
## Server Name
Agent Runway

## Description
MCP server for Canadian real estate agents. It has 37 tools. 25 read tools cover transactions, pipeline deals, CRM clients, CASL consent, expenses, mileage tracking and the CRA vehicle logbook, imported bank and card statement lines, income forecasts, Runway Score (business health grade), GST/HST status, Canadian income tax estimates (all 13 provinces/territories) and what the in-app AI changed, and read a pasted call or showing note into proposed changes. 12 write tools create and update pipeline opportunities, save the approved note items, record CASL consent and withdrawals, log trips, logbook periods and odometer readings, and confirm imported statement lines; mark_opportunity_lost is flagged destructive.

## Server URL
https://wlxkvnbncfzkmxzexgxt.supabase.co/functions/v1/mcp-server

## Transport
Streamable HTTP (JSON-RPC 2.0 over HTTPS)

## Authentication
Bearer token: the Supabase access token (JWT) from a signed-in Agent Runway session. It expires after about an hour. There are no API keys, and OAuth is not available. Requires Agent Runway Pro access.

## Tools (37 total: 25 read, 12 write)
- **Analytics:** get_dashboard_kpis, get_runway_score, get_forecast, get_tax_estimate, get_hst_status
- **Transactions:** get_transactions, get_transaction_summary
- **Pipeline:** get_pipeline, get_pipeline_forecast
- **Opportunities:** list_opportunities (read); create_opportunity, promote_opportunity, advance_buyer_prospect_stage, mark_opportunity_lost (write; mark_opportunity_lost is destructive)
- **CRM:** get_clients, get_client_detail
- **Expenses and vehicle logbook:** get_expenses, get_mileage_summary, get_logbook_status (read); log_mileage, start_logbook_period, record_odometer_reading (write)
- **Statement imports:** list_import_review_lines, draft_line_categories, explain_import_line (read); match_receipt_to_line, confirm_import_lines (write)
- **Outreach:** get_flight_control_priorities
- **Settings:** get_user_settings
- **Note capture:** capture_note (read); save_captured_note (write)
- **Consent (CASL):** get_client_consent, list_consent_lapsing (read); record_consent, withdraw_consent (write)
- **AI activity:** get_ai_activity
- **Meta:** get_server_info

## Links
- Website: https://agentrunway.ca
- Landing page: https://agentrunway.ca/mcp
- Registry JSON: https://agentrunway.ca/mcp-server.json
- Auto-discovery: https://agentrunway.ca/.well-known/mcp.json
- GitHub: https://github.com/Ashaw19/agentrunway-web

## Category
Real Estate, Analytics, CRM, Finance, Canadian Tax
```

---

## 4. MCPMarket / Cline Marketplace (GitHub issue)

**URL:** https://github.com/cline/mcp-marketplace → New Issue

**Title:**
```
[Server Submission] Agent Runway — Canadian Real Estate Analytics
```

**Body:**
```markdown
## GitHub Repository
https://github.com/Ashaw19/agentrunway-web

## Server Location
apps/web/supabase/functions/mcp-server/

## What does this server do?
Agent Runway is a business analytics platform for Canadian real estate agents. The MCP server has 37 tools. 25 read tools let AI assistants query an agent's:
- Transaction history and GCI (gross commission income)
- Pipeline deals with probability-weighted forecasts
- CRM client database with flight status tracking
- Business expenses, mileage logs and the CRA vehicle logbook (business-use share by CRA's simplified method)
- Imported bank and credit-card statement lines waiting for review
- Canadian income tax estimates for all 13 provinces/territories
- Runway Score (composite business health grade, 0-100)
- What Agent Runway's in-app AI changed in their records, and the AI calls it made

12 write tools create and update pre-transactional pipeline opportunities (listing appointments, buyer prospects, referrals), save the items from a pasted call or showing note that the agent approved (capture_note reads the note first), record CASL consent and withdrawals, log trips, logbook periods and odometer readings, and confirm imported statement lines into the expense records. mark_opportunity_lost is flagged destructive.

## Why is this useful for Cline users?
Real estate agents using Cline can query their entire business state through natural language — "How's my pipeline looking?", "What's my tax estimate?", "Which clients need follow-up?" — without switching to the Agent Runway dashboard.

## Transport
Streamable HTTP with Bearer token authentication: the Supabase access token (JWT) from a signed-in Agent Runway session, which expires after about an hour. No API keys; OAuth is not available.

## Logo
https://agentrunway.ca/logo.png
```

---

## 5. Official MCP Registry (future)

Requires publishing an npm package and using the `mcp-publisher` CLI:
```bash
brew install mcp-publisher
mcp-publisher init
mcp-publisher login github
mcp-publisher publish
```

This is designed for installable servers (npm/PyPI/Docker). Our hosted Supabase Edge Function doesn't fit this model perfectly. Options:
- Publish a thin npm config package that just documents the hosted URL
- Wait for the registry to better support hosted/SaaS MCP servers (it's still in preview)

**Recommendation:** Skip for now, revisit when the official registry supports hosted servers natively.
