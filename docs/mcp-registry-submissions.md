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
MCP server for Canadian real estate agents — exposes business analytics through 16 tools covering transactions, pipeline deals, CRM clients, expenses, mileage tracking, income forecasts, Runway Score (business health grade), and Canadian income tax estimates (all 13 provinces/territories).

## Server URL
https://wlxkvnbncfzkmxzexgxt.supabase.co/functions/v1/mcp-server

## Transport
Streamable HTTP (JSON-RPC 2.0 over HTTPS)

## Authentication
Bearer token (Supabase JWT). Requires Agent Runway Pro subscription.

## Tools (16 total)
- **Analytics:** get_dashboard_kpis, get_runway_score, get_forecast, get_tax_estimate
- **Transactions:** get_transactions, get_transaction_summary
- **Pipeline:** get_pipeline, get_pipeline_forecast
- **CRM:** get_clients, get_client_detail
- **Expenses:** get_expenses, get_mileage_summary
- **Outreach:** get_flight_control_priorities
- **Settings:** get_user_settings
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
Agent Runway is a business analytics platform for Canadian real estate agents. The MCP server exposes 16 read-only tools that let AI assistants query an agent's:
- Transaction history and GCI (gross commission income)
- Pipeline deals with probability-weighted forecasts
- CRM client database with flight status tracking
- Business expenses and mileage logs with CRA deduction calculations
- Canadian income tax estimates for all 13 provinces/territories
- Runway Score (composite business health grade, 0-100)

## Why is this useful for Cline users?
Real estate agents using Cline can query their entire business state through natural language — "How's my pipeline looking?", "What's my tax estimate?", "Which clients need follow-up?" — without switching to the Agent Runway dashboard.

## Transport
Streamable HTTP with Bearer token authentication (Supabase JWT).

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
