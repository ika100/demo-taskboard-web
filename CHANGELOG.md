# Changelog

## 0.1.1 (2026-11-04)

### Fixed

- Runtime image: npm, npx and corepack are removed, and with them npm's bundled undici 6.28.0
  (CVE-2026-109383, CVE-2026-109869, CVE-2026-19534, CVE-2026-87018) and brace-expansion 5.0.9 (CVE-2026-102276).
  The server never used them; the release image scan now passes.

## 0.1.0 (2026-11-04)

Tagged but not published: its release image scan found the CVEs fixed in 0.1.1.

### Added

- Task list and add-task form on the root page, replacing the starter page (#3).
