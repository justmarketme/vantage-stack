# Blueprint Validator (MCP)

This MCP server validates and structures client “blueprint” / onboarding questionnaire submissions into a single clean JSON object, and flags data quality concerns.

## Tools

- `validate-email`
- `validate-url`
- `check-field-completion`
- `structure-json-output`
- `flag-data-issues`

## Run locally

```bash
npm run mcp:blueprint-validator
```

## Expected structured output shape

`structure-json-output` returns a single JSON object with these keys:

- `client_name`
- `email`
- `whatsapp`
- `website_url`
- `industry`
- `revenue_range`
- `top_three_challenges` (string[])
- `competitors` (string[])
- `current_marketing_channels` (string[])
- `tools_in_use` (string[])
- `monthly_budget`
- `success_goals` (string[])
- `warnings` (string[])

## Cursor tool prompt (copy/paste)

Take the client blueprint responses from the form submission. Validate all required fields. If any are missing, return an error message. If all are present, structure them into this JSON format: client name, email, whatsapp, website URL, industry, revenue range, top three challenges, competitors, current marketing channels, tools in use, monthly budget, success goals. Return a single clean JSON object. If there are any data quality concerns—like a suspicious domain or unrealistic revenue—flag them in a warnings array.

