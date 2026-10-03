---
name: project-map
description: Maintain repository-backed Project Map models, status evidence, and deterministic static builds when a user asks to create, update, validate, or build a Project Map. Use only with an existing project-map-kit setup or when the user explicitly asks to initialize one.
---

# Project Map

Maintain a Project Map from facts that are already present in the user's repository. Treat confirmed product documentation, versioned schemas, code, tests, and dated evidence according to the repository's own authority rules. Code proves observed behavior; it does not by itself confirm a product rule.

Before adding or changing configuration, read [references/configuration.md](references/configuration.md). Also read applicable repository instructions and the narrow source files needed to support the requested map change.

## Work within the model boundary

- Change the repository's `project-map.json`, project JSON, LikeC4 model files, status JSON, Mermaid state sources, or their cited evidence when the request requires it.
- Preserve stable project, domain, module, relation, flow, and state IDs. Change an ID only when the represented concept changed and update every reference in the same task.
- Record unconfirmed or missing information as unconfirmed, missing, or unrecorded. Do not invent relationships, thresholds, completion percentages, acceptance results, dates, or evidence.
- Keep evidence paths repository-relative, specific, and resolvable. State the date and scope of status evidence; historical checks do not become current acceptance.
- Do not rewrite the packaged UI, CLI, or build implementation to express a repository-specific map. Ask for an explicit product change if the existing model/configuration format cannot represent the request.
- Keep private data, credentials, and unapproved source text out of the model and static output.

## Validate with the existing program

Use the package already present in the repository. The Skill can live in a repository-level `.agents/skills/project-map` directory or another path supplied by the user. From the relevant workspace, run:

```bash
npm exec -- project-map validate --root . --config project-map.json
npm exec -- project-map build --root . --config project-map.json --out dist/project-map
```

Use `node bin/project-map.mjs` with the same arguments when working inside the package itself. Run `validate` after model edits; run `build` when the user asks for a reviewable site or when build output is the task's acceptance artifact. Do not treat a successful build as proof that model claims are true.

The CLI and generated site are deterministic local programs and use no LLM at runtime. They do not upload a repository or publish a site. If publication is requested, show the user the built static output and call out that it contains explicit model text, statuses, and evidence paths before using the separately authorized publishing workflow.
