# Mustaner n8n channel workflows

`mustaner-sales-workflows.mjs` adapts the supplied Chatwoot and Meta Messenger templates into two inactive staging workflows. It preserves their channel parsing, human takeover and Data Table buffering, while setting the debounce to 15 seconds and adding Mustaner’s sales rules, OpenAI media summaries for voice, images, PDFs, DOCX and video, live course search, meeting reservation and human-handoff tools.

Run `node n8n/mustaner-sales-workflows.mjs > mustaner-sales-staging.json` to inspect the import payload, or set `N8N_BASE_URL` and run `node n8n/mustaner-sales-workflows.mjs --deploy` to create inactive workflows through the n8n API. `N8N_API_KEY` is read from the environment and never written to the workflow.

Before activating either workflow, select these n8n credentials and values:

- `Mustaner OpenAI` credential for the agent model.
- `Mustaner Agent API` header-auth credential using a scoped Mustaner API key.
- `MUSTANER_API_BASE_URL` and `MUSTANER_OPENAI_API_KEY` n8n variables.
- The Chatwoot/Meta channel credentials and the two Data Tables referenced by the original templates.

Leave both workflows inactive until their channel webhooks, Data Tables and credentials have been selected in n8n. No customer, Odoo or notification traffic is sent by the staging import.
