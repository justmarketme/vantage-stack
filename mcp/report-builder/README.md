# report-builder (MCP)

Business report generator MCP server.

## What it does

Exposes tools that turn “Agent 2 research JSON” into a business-ready markdown report:

- `generate-health-score`
- `identify-gaps`
- `calculate-revenue-opportunity`
- `frame-upsells`
- `create-markdown-report`

## Run locally

1) Install deps

```bash
npm install
```

2) Start the MCP server

```bash
npm run mcp:report-builder
```

## Add to Cursor MCP config

Add a server entry pointing at the npm script/command above (how you do this depends on your Cursor MCP UI/settings).
The server name should be `report-builder`.

