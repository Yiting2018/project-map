# Project Map configuration reference

Use this summary when creating or changing a manifest, project configuration, LikeC4 model, status file, or Mermaid state source. If the toolkit is installed in the repository, also read its `docs/configuration.md` for the complete fields supported by that version.

## Files and paths

- `project-map.json` contains a non-empty `projects` array. Each entry points to a project JSON relative to the manifest.
- `modelPath`, `statusPath`, `states[].sourcePath`, `recentWork.source.path`, status evidence paths, and LikeC4 metadata source paths are relative to the project JSON that owns them.
- Paths must stay within the declared workspace and resolve to existing files or directories. Metadata may contain semicolon-separated paths; validate each one.
- Keep LikeC4 sources in a dedicated directory such as `architecture/`, separate from generated `dist/` output.

## Identity and presentation

- Project IDs use lowercase letters, digits, and hyphens and start with a letter.
- Preserve stable domain, module, relation, flow, and state IDs. Every configured module reference must match an exported LikeC4 element ID exactly.
- `domainKind` identifies domain elements. Modules live below a domain and map to exactly one configured layer, either through their element kind or an explicit `modulePresentation.layerId`.
- Colors are six-digit hex values. Icons use names supported by the installed toolkit.

## Flows and states

- A configured flow references an existing LikeC4 view. Simple dynamic views preserve source step order; ordinary views describe relationships without implying order.
- Complex dynamic control blocks are not supported. Keep supported flows linear or record the unsupported model as an explicit limitation.
- A state entry has one `sourcePath` for a local Mermaid `.mmd` file, or one `assetPath` for a local SVG, plus known `moduleIds`. Do not provide both source forms. Validation and build fully render Mermaid sources with local Chromium; follow the installed toolkit's browser setup command before running either operation.

## Status and evidence

- A module status phase must exist in the project's status dictionary. Required arrays are `blockers`, `work`, `acceptance`, and `evidence`.
- Acceptance results are `passed`, `failed`, or `not_run`. An empty acceptance list means no acceptance items are defined; it does not imply a percentage.
- Omit a module status when there is no record. The UI treats it as unrecorded, not as unstarted.
- Evidence includes a title, relative path, recorded date, and scope. Keep historical evidence scoped to the observation it actually supports.

Run `project-map validate` after edits and consult the installed toolkit's configuration document when validation reports an unsupported or ambiguous field.
