# Project skills

This repo contains nine unmodified [tstack](https://github.com/t3dotgg/tstack)
workflow skills and eight adapted [pstack](https://github.com/cursor/plugins/tree/ae5650febf4320793844c12c4adaa937f417f8da/pstack)
engineering skills. Supporting files are local; no user-wide installation or
Cursor companion plugin is required.

## Tstack provenance

- Source revision: [`1085050f3baed1ac724caa4a8166145fb2ac88af`](https://github.com/t3dotgg/tstack/commit/1085050f3baed1ac724caa4a8166145fb2ac88af).
- Upstream instructions: [README at this revision](https://github.com/t3dotgg/tstack/blob/1085050f3baed1ac724caa4a8166145fb2ac88af/README.md).
- License: [MIT, copyright Theo Browne](TSTACK-LICENSE). This license covers the imported skills; it does not select a license for the synth application.
- Repo-specific routing and preferences: [AGENTS.md](../AGENTS.md).

## Pstack provenance

- Source revision: [`ae5650febf4320793844c12c4adaa937f417f8da`](https://github.com/cursor/plugins/commit/ae5650febf4320793844c12c4adaa937f417f8da), pstack 0.15.36.
- License: [MIT, copyright Lauren Tan](PSTACK-LICENSE).
- [Adoption review](pstack-review.md) covers every skill and explains the local adaptations and exclusions.
- Engineering guidance uses normal skill discovery and local dependency links. It does not activate pstack's global configuration, orchestration, or automation pack.

[skills-lock.json](skills-lock.json) records each source path, upstream file hash,
installed file hash, executable mode, and skill dependency. The original and
adapted hashes distinguish upstream content from deliberate local changes.

## Discovery and requirements

Codex discovers this repository's `.agents/skills/` directory as documented in
[Build skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).
The files are local to this project; no user-wide skills were installed.

PR workflows require an authenticated GitHub CLI (`gh`). The bundled `pr-wait`
fallback requires Python 3 and a Unix-like platform (`fcntl`); T3 Code uses its
own PR watcher. Multi-model review requires the providers and delegation tools
specified by the selected skill. Installing these files does not configure
provider access, review bots, or repository branch protection.

## Updating tstack

Resolve the desired upstream commit and read its README and skill changes.
Install all nine `skills/*` directories from that commit into a temporary
directory, then compare them with this directory before replacing the vendored
copies. Preserve the executable bit on `babysit-pr/scripts/pr-wait` and all
supporting files. Update the revision above and `TSTACK-LICENSE` together.

Keep project preferences in the root `AGENTS.md`, as upstream recommends, so
updating the skills does not overwrite them. Verify each `SKILL.md`, relative
dependency link, and imported file against the chosen upstream revision.

## Updating pstack and validating the installation

1. Review the proposed upstream revision, license, and changes in a temporary directory. Use the source paths in `skills-lock.json`; preserve supporting resources.
2. Reapply or revise the documented local adaptations. Update the adoption review when a decision changes. Keep workflow ownership and project scope intact.
3. Record the new revision and upstream hashes only after comparison against the downloaded source. Record new/removed files and dependencies explicitly in the lockfile.
4. Run `node scripts/check-skills.mts --update-hashes` to accept reviewed edits to adapted files. This does not change upstream hashes, licenses, or unmodified tstack hashes.
5. Run `node scripts/check-skills.mts` and the repository checks. Review the source/installed hash diff with the content diff before committing.

The checker verifies registered files, hashes, modes, declared dependencies,
entry-point identities, and relative Markdown link targets. It does not establish
that prose is correct, validate remote URLs, or authenticate a malicious edit
that changes both a file and its recorded hash. Those remain review concerns.
