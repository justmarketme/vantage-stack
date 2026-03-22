# Blueprint Validator MCP — Setup

This repo includes a local MCP server at `mcp/blueprint-validator/server.ts`.

## Run it (stdio MCP server)

```bash
npm run mcp:blueprint-validator
```

## Register it in Cursor

In Cursor, add an MCP server entry that runs the command above.

- **name**: `blueprint-validator`
- **command**: `npm`
- **args**: `["run", "mcp:blueprint-validator"]`
- **cwd**: this repo root (the `vantage-stack` folder)

Once registered, Cursor will expose these tools:

- `validate-email`
- `validate-url`
- `check-field-completion`
- `structure-json-output`
- `flag-data-issues`

## “Agent 1” prompt (for your orchestrator)

Take the client blueprint responses from the form submission. Validate all required fields. If any are missing, return an error message. If all are present, structure them into this JSON format: client name, email, whatsapp, website URL, industry, revenue range, top three challenges, competitors, current marketing channels, tools in use, monthly budget, success goals. Return a single clean JSON object. If there are any data quality concerns—like a suspicious domain or unrealistic revenue—flag them in a warnings array.

