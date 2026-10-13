# Security Policy

## Supported versions

The latest release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report vulnerabilities privately using GitHub's
[private vulnerability reporting](https://github.com/runexes/PoE2MT/security/advisories/new),
or email the maintainer if you prefer.

Please include:

- a description of the issue and its impact,
- steps to reproduce,
- affected version(s) and platform.

You can expect an initial response within a few days. We will keep you updated on the fix and
credit you in the release notes unless you ask to stay anonymous.

## Scope

This application runs locally and only reads the log file you select. Areas of interest include
the local overlay HTTP server and the Electron IPC surface. Please keep reports specific to this
project; issues in upstream dependencies should be reported upstream.
