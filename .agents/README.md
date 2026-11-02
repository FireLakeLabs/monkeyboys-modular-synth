# Project skills

The nine skills in `skills/` are unmodified copies from
[t3dotgg/tstack](https://github.com/t3dotgg/tstack), including their supporting
scripts and agent metadata.

- Source revision: [`1085050f3baed1ac724caa4a8166145fb2ac88af`](https://github.com/t3dotgg/tstack/commit/1085050f3baed1ac724caa4a8166145fb2ac88af).
- Upstream instructions: [README at this revision](https://github.com/t3dotgg/tstack/blob/1085050f3baed1ac724caa4a8166145fb2ac88af/README.md).
- License: [MIT, copyright Theo Browne](TSTACK-LICENSE). This license covers the imported skills; it does not select a license for the synth application.
- Repo-specific routing and preferences: [AGENTS.md](../AGENTS.md).

## Discovery and requirements

Codex discovers this repository's `.agents/skills/` directory as documented in
[Build skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).
The files are local to this project; no user-wide skills were installed.

PR workflows require an authenticated GitHub CLI (`gh`). The bundled `pr-wait`
fallback requires Python 3 and a Unix-like platform (`fcntl`); T3 Code uses its
own PR watcher. Multi-model review requires the providers and delegation tools
specified by the selected skill. Installing these files does not configure
provider access, review bots, or repository branch protection.

## Updating

Resolve the desired upstream commit and read its README and skill changes.
Install all nine `skills/*` directories from that commit into a temporary
directory, then compare them with this directory before replacing the vendored
copies. Preserve the executable bit on `babysit-pr/scripts/pr-wait` and all
supporting files. Update the revision above and `TSTACK-LICENSE` together.

Keep project preferences in the root `AGENTS.md`, as upstream recommends, so
updating the skills does not overwrite them. Verify each `SKILL.md`, relative
dependency link, and imported file against the chosen upstream revision.
