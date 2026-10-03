# Validation

## 0.1.1 — English and Chinese editions

2026-10-03, local Node.js 26.7.0 / npm 11.19.0.

- 60 automated tests passed, including locale validation, translated UI coverage, initial HTML language, complete bilingual package contents and nested technical-view serving.
- Both fictional projects build in English and Chinese, including translated Mermaid state diagrams. The translated pairs retain identical module IDs, relationship endpoints and status phases.
- Actual browser checks covered overview, module details, linked flow navigation and development status in each language at 1440×900. English overview had no horizontal overflow; the Chinese overview was also visually inspected.
- The README GIFs contain four frames captured from those actual UI states, loop for 12 seconds and are each under 1 MB. Static full-page screenshots are supplied as well.
- The repository provides English and Chinese READMEs. Example text and core UI labels use the selected language; stable machine IDs and evidence file paths are preserved. The upstream LikeC4 viewer retains its own toolbar language.
- Distribution uses repository files and GIFs; no hosted demo or Pages workflow is included.

## 0.1.0 baseline

- 54 automated tests passed for model references, hierarchy, status, CLI initialization, no-Git validation, symlinks, path containment, input protection, passive SVG, read-only HTTP and package contents.
- The npm tarball installed in a fresh directory outside the source package and passed init → validate → build with no Git repository.
- Two fictional examples and Mermaid diagrams built; SVG output passed XML parsing.
- The main dashboard had no observed console errors. During standalone SVG/technical-view navigation, the in-app browser recorded one unassigned animation exception; the views displayed. This does not claim all third-party viewer paths are error-free.

These are local toolkit checks, not acceptance of any sample business. Windows, Linux, mobile and full assistive-technology acceptance remain unverified. Sources, generated output and package contents are reviewed before release; all examples and screenshots are fictional. Runtime has no LLM or automatic repository-upload entry point.
