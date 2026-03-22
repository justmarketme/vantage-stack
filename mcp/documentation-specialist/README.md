# documentation-specialist MCP

Generates and maintains system documentation for VantageStack.

## Tools

- `generate-api-docs`: Scans `app/api/**/route.ts` and emits an OpenAPI 3.0 JSON file.
- `create-user-guides`: Generates internal CRM usage guide markdown.
- `document-agent-workflows`: Generates agent workflow docs + Mermaid flowchart.
- `generate-onboarding-guide`: Generates a developer onboarding guide markdown.
- `create-changelog`: Appends a deployment entry to `docs/CHANGELOG.md`.
- `build-docs-site`: Scaffolds a lightweight docs site skeleton (Mintlify-style).

## Run locally

Use the npm script:

- `npm run mcp:documentation-specialist`

