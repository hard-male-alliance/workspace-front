# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at `TwoJie2/workspace-front`. Use the `gh` CLI for issue operations and infer the repository from the local Git remote.

## Conventions

- Create an issue with `gh issue create`.
- Read an issue and its comments with `gh issue view <number> --comments`.
- List issues with `gh issue list` and request structured JSON when filtering is required.
- Comment with `gh issue comment <number>`.
- Apply or remove labels with `gh issue edit <number>`.
- Close with `gh issue close <number>`.

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch the relevant ticket, read the GitHub issue and its comments.

Do not create, edit, label, comment on, or close an issue unless the user has authorized that external change.
