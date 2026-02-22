# Contributing to S3-Compatible Storage Server

Thank you for considering contributing to this project! This document provides guidelines and information for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Code Style](#code-style)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/<your-username>/s3-compatible.git`
3. **Create a branch**: `git checkout -b feature/your-feature-name`
4. **Make your changes** and test them
5. **Push** to your fork: `git push origin feature/your-feature-name`
6. **Open a Pull Request** against the `main` branch

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- MySQL 8.0+
- Node.js 18+ (for dashboard)

### Setup

```bash
# Install backend dependencies
bun install

# Install dashboard dependencies
cd dashboard && bun install && cd ..

# Copy environment files
cp .env.sample .env
cp dashboard/.env.sample dashboard/.env

# Push database schema
bun run db:push

# Start development servers
bun run dev                    # Backend (port 3000)
cd dashboard && bun run dev    # Dashboard (port 5173)
```

## How to Contribute

### Reporting Bugs

- Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template
- Include steps to reproduce the issue
- Include expected vs actual behavior
- Include your environment details (OS, Bun version, MySQL version)

### Suggesting Features

- Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue template
- Describe the problem your feature would solve
- Describe the proposed solution
- Consider any alternatives you've thought of

### Code Contributions

We welcome contributions in these areas:

- **Bug fixes** — Fix reported issues
- **New S3 operations** — Implement missing S3 API operations
- **Storage backends** — Add support for other storage backends (e.g., cloud storage)
- **Dashboard improvements** — UI/UX enhancements
- **Documentation** — Improve docs, add examples
- **Tests** — Add unit and integration tests
- **Security** — Report vulnerabilities privately to maintainers

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`; avoid `var`
- Use explicit return types for exported functions
- Use descriptive variable and function names
- Keep functions small and focused

### General

- No unnecessary comments — code should be self-documenting
- Handle errors explicitly; don't silently swallow exceptions
- Use async/await over raw Promises
- Keep dependencies minimal

### File Organization

- Backend routes go in `src/routes/`
- Shared utilities go in `src/lib/`
- Dashboard components go in `dashboard/src/components/`
- Dashboard pages go in `dashboard/src/pages/`

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, missing semi-colons, etc.) |
| `refactor` | Code refactoring (no feature change or bug fix) |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Build process or tooling changes |
| `security` | Security improvements |

### Examples

```
feat(s3): add ListMultipartUploads operation
fix(auth): handle expired presigned URLs correctly
docs: update README with Python examples
security(auth): add rate limiting to admin login
```

## Pull Request Process

1. **Ensure your PR is focused** — One feature or fix per PR
2. **Update documentation** if your changes affect the public API
3. **Test your changes** — Verify that existing functionality still works
4. **Write a clear PR description** explaining:
   - What the change does
   - Why the change is needed
   - How it was tested
5. **Link related issues** using `Closes #123` or `Fixes #123`

### PR Review Checklist

- [ ] Code follows the project's style guidelines
- [ ] Self-review of the code has been performed
- [ ] Changes are documented where necessary
- [ ] No new warnings are introduced
- [ ] Related tests pass

---

## Questions?

Feel free to open an issue with the **Question** label if you have any questions about contributing.

Thank you for helping make this project better! 🎉
