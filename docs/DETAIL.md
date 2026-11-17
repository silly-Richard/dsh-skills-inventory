# Skills

Adds a **Skills** page to the sidebar, between **Plugins** and **Automation tasks**. It lists every skill this host can see and switches each one on or off for the model.

## What the page shows

- **Name, description, and instruction-file path** of each skill.
- **Scope badge**: `Global` (user-level roots, available in any workspace), `Project` (the current workspace's `.dsh/skills` or `.agents/skills`), `Built-in` (shipped with the installation), `Plugin` (registered in memory with no file), `Other`.
- **Invocation policy**: whether the model can load the skill and whether a person can invoke it.
- **Workspace line**: which workspace the project-scoped part belongs to — the session's workspace when the page can identify one, otherwise the most recently updated workspace.
- **Search and filter chips**, including one for switched-off skills.
- **Copy path** and **Open folder** for a single skill.

## The switch

Each card carries a switch, like the Plugins page. **On** is the default and means the skill behaves normally. **Off** blocks loading: the `skill` tool refuses that name, so neither the model nor a remembered call can load the instructions.

**No skill file is touched.** Nothing is renamed, edited, moved, or deleted; the switch only changes whether the instructions may be loaded. Turning it back on restores loading on the next call.

A skill can be switched off even when it is built in or shipped inside the installation archive, because the decision is made at request time rather than by the file layout.

**The catalog may still list a switched-off skill.** The published DSH release assembles request messages after the step-preparation event a plugin can intercept, so this page cannot remove the entry from that text; the block happens when the instructions are requested. The page says so in its own copy rather than implying the name disappears.

## Roots it reads

| Badge | Root |
|---|---|
| Global | `%DSH_HOME%\skills`, `%USERPROFILE%\.agents\skills` |
| Project | `<workspace>\.dsh\skills`, `<workspace>\.agents\skills` |
| Built-in | the installation's bundled skill directory, and skills shipped inside the installation archive |

The catalog comes from the shared skill registry when the running composition mounts it, so plugin-registered skills appear too. Without that service the same roots are scanned on disk; the page reports a warning rather than failing.

## Where switch state lives

The plugin keeps one small state file of its own:

```
%DSH_HOME%\skills-inventory\state.json   →   { "disabled": ["<skill name>", …] }
```

It is plugin data, not a skill file. Deleting it switches every skill back on.

## Deleting a skill

Expand a card and use the red **Delete** button beside **Copy path** and **Open folder**. A confirmation dialog shows the exact directory, how many files and how much data go with it, and where the copy will land. Deleting is offered only for skills this page can remove — a user-global skill, or a project skill under the current workspace; built-in and plugin-registered skills show a note instead.

What deletion does:

- The **whole skill directory** leaves its scan root: `<root>/<name>/` (or the flat `<root>/<name>.md`).
- It goes to the **operating system's recycle bin**, so restoring is the normal Windows **Recycle Bin → Restore** action. Nothing is erased while it sits there.
- The name leaves the switch-off list too, so no orphan entry survives.
- If the system trash is unavailable (a platform without it, or a failed call), the directory is moved into the plugin's own `%DSH_HOME%\skills-inventory\trash\` instead, and the page says where it went.

The request carries only the skill name; the Host re-derives and validates the path against its own roots, refuses anything that is not a direct child of a root, and refuses a directory without `SKILL.md` — so a stale page cannot delete an arbitrary path.

## Limits

- **The catalog text is not filtered.** The published release assembles request messages after the only step event a plugin may rewrite; the switch therefore enforces at load time. A model may still see the name until the release exposes a filtering seam.
- A person typing `/<skill>` in the composer is handled by another plugin's own listener, which this page does not intercept.
- Skill content already loaded in a session stays in that session's history.
- One snapshot per visit: the list is read when the page opens and again on **Refresh**; it does not watch the directories.
