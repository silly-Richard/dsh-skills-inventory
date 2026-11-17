# dsh-skills-inventory

A **Skills** page for the [DeepSeek Harness](https://github.com/deepseek-ai) Web sidebar. It lists every skill installed on the host, marks which ones are user-global, lets you switch a skill off for the model, and deletes a skill into the operating system's recycle bin.

> DSH 侧边栏的「技能」管理页：列出本机所有 skill、标注全局/项目/内置、逐项开关（控制模型能否加载）、以及把技能删除到系统回收站。

## Features

- **One list, every source.** User-global (`%DSH_HOME%\skills`, `~/.agents/skills`), project (`.dsh/skills`, `.agents/skills` of the current workspace), built-in skills shipped with the installation, and skills registered by plugins.
- **Scope badges** so a global skill is never confused with a project one.
- **Bilingual UI** — the page, its dialogs and its sidebar label follow the app language (English and Chinese ship in one dictionary).
- **Per-skill switch.** Off means the model can no longer load the skill; nothing on disk changes.
- **Delete with confirmation.** The whole skill directory moves to the system recycle bin, so restoring is the normal Recycle Bin → Restore.
- **Search, filter, copy path, reveal in the file manager.**
- **Read-only by default in spirit:** the page never edits a `SKILL.md`; the only file it owns is its own switch state.

## Install

Requires DSH `>= 0.2.2-rc.3` with the Web GUI.

```bash
dsh plugin add github:<your-account>/dsh-skills-inventory
```

Or open **Plugins → Add plugin** in the Web UI and paste the repository URL. Then enable the bundle and reload the page.

## Usage

Open **Skills** in the sidebar — it sits between **Plugins** and **Automation tasks**.

| Action | Effect |
|---|---|
| Switch **on** (default) | The skill behaves normally. |
| Switch **off** | The `skill` tool refuses that name, so the model cannot load the instructions. No file is touched. |
| Expand a card | Shows path, provider, modified time, invocation policy, **Copy path**, **Open folder**. |
| **Delete** (red, expanded rows only, global/project skills) | Asks for confirmation, then moves the whole directory to the system recycle bin. |

## Where state lives

Switch state is one small file of this plugin's own:

```
%DSH_HOME%\skills-inventory\state.json   →   { "disabled": ["<skill name>", …] }
```

Deleting that file switches every skill back on. It is plugin data, never a skill file.

## Limits worth knowing

- **The model's catalog may still list a switched-off skill.** The catalog text is assembled after the step event a plugin can intercept, so the block happens at load time. The page says so in its own copy.
- **A person typing `/<skill>` in the composer** is handled by another plugin's own listener; this page does not intercept it.
- **Same name in two places:** when a filesystem skill and this plugin's skill share a name, the nearer layer wins. A file under `~/.dsh/skills` takes precedence over a plugin-registered copy.
- **Deletion is per directory.** A project skill that lives in a Git repository becomes an uncommitted change.
- **Built-in and plugin-registered skills** cannot be deleted (no file, or a read-only archive); they show a note instead.

## Security

The Host half registers three local HTTP routes under `/api/skills-inventory`:

| Route | Purpose | Guard |
|---|---|---|
| `GET /api/skills-inventory` | inventory snapshot | read-only |
| `POST /api/skills-inventory/toggle` | switch a skill off/on | writes only its own state file |
| `POST /api/skills-inventory/delete` | move one skill to the recycle bin | accepts **only a skill name**; the Host re-resolves the path, requires it to be a direct child of a scanned root, and requires the directory to contain `SKILL.md` |
| `POST /api/skills-inventory/open` | reveal a skill file | only paths inside the scanned roots |

The Web server binds loopback by default. Do not expose this host to an untrusted network.

## Development

```bash
git clone https://github.com/<your-account>/dsh-skills-inventory
cd dsh-skills-inventory
```

Install it as a local bundle instead of publishing:

```bash
dsh plugin add /absolute/path/to/dsh-skills-inventory
```

No build step: the Host half is plain ESM using only Node built-ins, and the Client half is a single browser module.

```
index.js        Host: inventory scan, switch state, delete-to-recycle-bin, HTTP routes
client.js       Client: sidebar entry + main panel (React, no bundler)
locale/*.json   Plugin title and description shown in the Plugins list
docs/DETAIL.md  Long description shown on the plugin detail page
icon.svg        Sidebar icon
```

## License

MIT — see [LICENSE](./LICENSE).
