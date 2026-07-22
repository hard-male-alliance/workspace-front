# Domain Docs

This repository uses a modular frontend with four business contexts: Workspace Experience,
Resume Authoring, Interview Practice, and Knowledge. App Shell, Host Runtime, and Observability are
supporting boundaries rather than business contexts.

Before exploring domain behavior, read `CONTEXT.md` at the repository root and the relevant
architectural decisions under `docs/adr/`.

Use canonical terms from `CONTEXT.md` in tests, plans, issues, and implementation. Surface any
conflict with an existing ADR instead of silently overriding it. Do not deep-import another
context's internal files or treat a transport DTO as a shared domain model.
