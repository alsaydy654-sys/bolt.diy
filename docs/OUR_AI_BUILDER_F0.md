# OUR AI BUILDER — F0 Product & Integration Contract
**Document ID:** OUR-AI-BUILDER-F0-001  
**Version:** 0.1  
**Status:** Draft — human review required  
**Branch:** feature/our-ai-builder-f0

## Goal
Create a mobile-first, responsive PWA control surface for managing AI-assisted application development, using this repository as the existing Bolt.diy codebase rather than creating a parallel builder from scratch.

## Non-goals for F0
- Do not rewrite Bolt.diy architecture.
- Do not connect to or expose private API keys in the browser UI.
- Do not auto-merge agent changes or push to the default branch.
- Do not claim direct Arena API control unless a documented, authorized integration exists.
- Do not deploy or incur paid services automatically.

## Product surfaces
1. Project overview: project/repository, active branch, recent activity, task status.
2. Mobile navigation: accessible touch targets, compact navigation, no desktop-only interactions.
3. Agent task composer: prompt, repository/branch context, task intent and approval boundaries.
4. Change review: file list, diff summary, test/check status, approve/reject next-step actions.
5. Workspace entry: link/embed strategy for the existing Bolt.diy editor, subject to a verified supported integration.
6. Arabic-first localization: RTL layout with Arabic labels and English technical terms where useful; retain accessible English identifiers in code.

## Integration architecture
- GitHub is the source of truth for code and version history.
- Arena Agent Mode is an external coding workflow. F0 should support launching/handing off a task and reviewing the resulting GitHub branch/PR, not scraping Arena or automating its private UI.
- Bolt.diy remains the builder/editor. Prefer an explicit route/module integration; avoid iframe embedding unless same-origin, authentication, CSP, and mobile behavior are validated.
- Any future server-side provider integration must keep secrets server-side and use least-privilege access.

## F0 acceptance criteria
- [ ] Audit current app stack, routing, UI components, auth, and persistence before changing existing code.
- [ ] Define responsive shell for mobile (Android) and desktop.
- [ ] Show repository and branch context without requiring users to type raw Git commands.
- [ ] Provide a safe agent handoff workflow based on GitHub branch/PR.
- [ ] Display pending changes and require human review before merge.
- [ ] No changes to unrelated projects or default-branch behavior.
- [ ] Document setup, environment variables, and rollback.

## Security and safety
- Never commit secrets, tokens, credentials, or personal data.
- Use OAuth/GitHub App permissions only after explicit user authorization.
- Use feature branches and pull requests for changes.
- Validate external URLs and sanitize any rendered repository content.
- Avoid executing untrusted project scripts automatically.

## Proposed phased delivery
- F0: repository audit + architecture/acceptance contract.
- F1: responsive Arabic PWA shell and project dashboard.
- F2: GitHub branch/PR status and change-review surface.
- F3: Arena handoff guidance/linking and task tracking.
- F4: verified Bolt.diy editor integration and live preview.
- F5: mobile/desktop testing, accessibility, security review.

## Open decisions (must be evidenced, not guessed)
- Best integration boundary for Bolt.diy (shared routes vs separate app/service).
- Authentication and user/project data storage.
- Whether Arena provides an officially supported deep link or API for task creation.
- Deployment target and operating cost.
