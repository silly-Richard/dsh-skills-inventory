window.__ModuleLoader__.load({
  id: 'dsh-skills-inventory',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    const NS = 'skillsInventory';
    const PANEL_ID = 'skills-inventory';
    const API = '/api/skills-inventory';

    const DICT = {
      zh: {
        panel: '技能',
        title: '技能',
        subtitle: '本机安装的所有 skill。关闭开关后模型无法加载该技能（目录里可能仍显示名称）；不修改任何技能文件。',
        search: '搜索名称、说明或路径',
        refresh: '刷新',
        retry: '重试',
        all: '全部',
        global: '全局',
        project: '项目',
        custom: '自定义',
        bundled: '内置',
        embedded: '插件内嵌',
        other: '其他',
        disabledTag: '已停用',
        workspace: '工作区',
        recent: '最近使用',
        none: '没有匹配的技能',
        loading: '正在读取技能列表…',
        failed: '读取失败',
        count: '共 {total} 个 · 全局 {global} · 项目 {project} · 内置 {bundled} · 插件内嵌 {embedded} · 已停用 {disabled}',
        copy: '复制路径',
        open: '打开所在文件夹',
        copied: '已复制',
        policyModel: '模型可调用',
        policyUser: '用户可用',
        policyNoModel: '模型不可调用',
        policyNoUser: '用户不可用',
        provider: '提供方',
        modified: '修改时间',
        path: '路径',
        warnings: '部分数据源不可用：',
        switchHint: '关闭只阻止加载，不改动文件',
        toggleFailed: '切换失败：',
        delete: '删除',
        deleteTitle: '删除技能',
        deleteScope: '将删除整个目录',
        deleteFiles: '共 {files} 个文件，约 {size}',
        deleteTarget: '移入系统回收站，可在「回收站」中还原：',
        deleteNoRestore: '需要恢复时，打开系统「回收站」，找到该目录右键「还原」即可。',
        deleteCopies: '同名的另一份位于 {paths}，不受影响。',
        deleteIrreversible: '删除后模型将无法再加载该技能，已加载进会话的内容不受影响。',
        deleteCancel: '取消',
        deleteConfirm: '删除',
        deleteWorking: '正在删除…',
        deletedTo: '已移入系统回收站：',
        deletedToPlugin: '系统回收站不可用，已移入插件回收站：',
        deleteFailed: '删除失败：',
        deleteUnavailable: '内置技能随安装包分发，不可删除',
      },
      en: {
        panel: 'Skills',
        title: 'Skills',
        subtitle: 'Every skill installed on this host. Switching one off blocks loading; the catalog may still show its name. No skill file is modified.',
        search: 'Search name, description, or path',
        refresh: 'Refresh',
        retry: 'Retry',
        all: 'All',
        global: 'Global',
        project: 'Project',
        custom: 'Custom',
        bundled: 'Built-in',
        embedded: 'Plugin',
        other: 'Other',
        disabledTag: 'Off',
        workspace: 'Workspace',
        recent: 'recently used',
        none: 'No matching skills',
        loading: 'Reading skills…',
        failed: 'Could not read the skill list',
        count: '{total} total · {global} global · {project} project · {bundled} built-in · {embedded} plugin · {disabled} off',
        copy: 'Copy path',
        open: 'Open folder',
        copied: 'Copied',
        policyModel: 'Model-invocable',
        policyUser: 'User-invocable',
        policyNoModel: 'Not model-invocable',
        policyNoUser: 'Not user-invocable',
        provider: 'Provider',
        modified: 'Modified',
        path: 'Path',
        warnings: 'Some sources were unavailable: ',
        switchHint: 'Off only blocks loading; the file stays as it is',
        toggleFailed: 'Could not switch: ',
        delete: 'Delete',
        deleteTitle: 'Delete skill',
        deleteScope: 'The whole directory is removed',
        deleteFiles: '{files} files, about {size}',
        deleteTarget: 'Moved to the system recycle bin; restore it from there: ',
        deleteNoRestore: 'To restore, open the system recycle bin, right-click the directory, and choose Restore.',
        deleteCopies: 'Another copy named the same lives at {paths} and is not affected.',
        deleteIrreversible: 'After deletion the model can no longer load this skill; content already loaded into a session is unaffected.',
        deleteCancel: 'Cancel',
        deleteConfirm: 'Delete',
        deleteWorking: 'Deleting…',
        deletedTo: 'Moved to the system recycle bin: ',
        deletedToPlugin: 'System recycle bin unavailable; moved to the plugin trash: ',
        deleteFailed: 'Delete failed: ',
        deleteUnavailable: 'Built-in skills ship with the installation and cannot be deleted',
      },
    };

    const CSS = `
.si-page { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0;
  overflow: hidden; color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-base, transparent); font-size: 14px; }
.si-col { width: 100%; max-width: 880px; margin-inline: auto; box-sizing: border-box; }
.si-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 24px 24px 12px; }
.si-headings { min-width: 0; }
.si-title { font-size: 20px; font-weight: 600; margin: 0 0 6px; line-height: 1.4; }
.si-sub { font-size: 13px; margin: 0; opacity: .68; line-height: 1.6; }
.si-ws { font-size: 12px; opacity: .6; margin-top: 8px; word-break: break-all; }
.si-ws code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.si-btn { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.32));
  background: transparent; color: inherit; }
.si-btn:hover { background: var(--dsw-alias-fill-secondary, rgba(128,128,128,.12)); }
.si-btn:disabled { opacity: .5; cursor: default; }
.si-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 0 24px 10px; }
.si-input { flex: 1 1 240px; min-width: 160px; font: inherit; font-size: 13px; padding: 7px 12px;
  border-radius: 8px; color: inherit; background: transparent;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.32)); }
.si-input:focus { outline: 2px solid var(--dsw-alias-brand-primary, #2563eb); outline-offset: -1px; }
.si-chip { font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 999px; cursor: pointer;
  color: inherit; background: transparent;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.32)); }
.si-chip[data-active="true"] { background: var(--dsw-alias-fill-secondary, rgba(128,128,128,.16));
  border-color: var(--dsw-alias-border-primary, rgba(128,128,128,.5)); font-weight: 600; }
.si-counts { font-size: 12px; opacity: .62; padding: 0 24px 10px; }
.si-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 24px 28px; }
.si-list { display: flex; flex-direction: column; gap: 10px; }
.si-card { display: flex; gap: 14px; align-items: flex-start; padding: 14px 16px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.28));
  background: transparent; }
.si-card:hover { background: var(--dsw-alias-fill-secondary, rgba(128,128,128,.08)); }
.si-card[data-off="true"] .si-cardmain { opacity: .55; }
.si-cardmain { flex: 1; min-width: 0; cursor: pointer; text-align: left; font: inherit; color: inherit;
  background: transparent; border: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.si-headline { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; flex-wrap: wrap; }
.si-name { font-size: 13.5px; font-weight: 600; white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.si-badge { font-size: 11.5px; line-height: 1.5; padding: 1px 9px; border-radius: 999px; white-space: nowrap;
  font-weight: 600; letter-spacing: .2px; color: #fff;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.16); background: #4b5563; }
.si-badge[data-scope="global"] { background: #2563eb; }
.si-badge[data-scope="project"] { background: #15803d; }
.si-badge[data-scope="bundled"] { background: #f5b301; color: #3a2a00;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.si-badge[data-scope="custom"] { background: #7e22ce; }
.si-badge[data-scope="embedded"] { background: #0e7490; }
.si-badge[data-off="true"] { background: #4b5563; }
.si-desc { font-size: 12.5px; opacity: .72; display: block; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.si-path { font-size: 11.5px; opacity: .5; display: block; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.si-body { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.si-line { font-size: 12.5px; margin: 0; word-break: break-all; opacity: .8; }
.si-line b { font-weight: 600; opacity: .9; }
.si-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; }
.si-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.si-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.si-btn-danger { border-color: rgba(220,38,38,.55); color: #dc2626; }
.si-btn-danger:hover { background: rgba(220,38,38,.12); }
.si-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center;
  justify-content: center; padding: 16px; background: rgba(0,0,0,.45); }
.si-dialog { width: min(540px, 94vw); box-sizing: border-box; padding: 18px 20px; border-radius: 12px;
  background: var(--dsw-alias-bg-base, #1b1b1b); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.32));
  box-shadow: 0 18px 48px rgba(0,0,0,.4); }
.si-dialog-title { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
.si-dialog p { margin: 0 0 8px; font-size: 13px; line-height: 1.6; }
.si-dialog .si-mono { display: block; word-break: break-all; }
.si-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.si-danger { color: #dc2626; }
.si-switch { position: relative; flex: 0 0 auto; width: 38px; height: 22px; margin-top: 2px;
  border-radius: 999px; border: 0; padding: 0; cursor: pointer;
  background: var(--dsw-alias-fill-tertiary, rgba(128,128,128,.45));
  transition: background .16s ease; }
.si-switch[aria-checked="true"] { background: #2563eb; }
.si-switch:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.si-switch:disabled { opacity: .6; cursor: default; }
.si-knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.28); transition: transform .16s ease; }
.si-switch[aria-checked="true"] .si-knob { transform: translateX(16px); }
.si-empty { font-size: 13.5px; opacity: .65; padding: 32px 4px; text-align: center; }
.si-error { font-size: 13px; padding: 14px 16px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.3)); }
.si-toast { font-size: 12.5px; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px;
  border: 1px solid rgba(220,38,38,.4); background: rgba(220,38,38,.1); }
.si-hint { font-size: 11.5px; opacity: .55; }
`;

    function pick(locale, key) {
      const dict = DICT[locale] || DICT.zh;
      return dict[key] ?? DICT.zh[key] ?? key;
    }

    /** Which dictionary to fall back to when the locale service is unavailable. */
    function fallbackLocale() {
      try {
        return String(document.documentElement.lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch {
        return 'en';
      }
    }

    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (_all, name) => (values[name] ?? ''));
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
      return (value / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function DeleteDialog(props) {
      const { pending, t, onCancel, onConfirm } = props;
      const { skill, preview, error, busy } = pending;
      return h('div', {
        className: 'si-overlay',
        role: 'presentation',
        onClick: onCancel,
      },
        h('div', {
          className: 'si-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('deleteTitle') + ' ' + skill.name,
          onClick: (event) => event.stopPropagation(),
        },
          h('h3', { className: 'si-dialog-title' }, t('deleteTitle') + ' ' + skill.name),
          preview ? h('p', null,
            t('deleteScope') + ' · ' + format(t('deleteFiles'), {
              files: preview.files, size: formatBytes(preview.bytes),
            })) : null,
          h('p', { className: 'si-mono' }, preview ? preview.target : skill.path),
          h('p', null, t('deleteTarget')),
          h('p', null, t('deleteNoRestore')),
          preview && Array.isArray(preview.sameNameCopies) && preview.sameNameCopies.length > 0
            ? h('p', null, format(t('deleteCopies'), { paths: preview.sameNameCopies.join('、') }))
            : null,
          h('p', { className: 'si-danger' }, t('deleteIrreversible')),
          error ? h('p', { className: 'si-danger' }, error) : null,
          h('div', { className: 'si-dialog-actions' },
            h('button', { type: 'button', className: 'si-btn', onClick: onCancel, disabled: busy },
              t('deleteCancel')),
            h('button', {
              type: 'button',
              className: 'si-btn si-btn-danger',
              onClick: onConfirm,
              disabled: busy || !preview,
            }, busy ? t('deleteWorking') : t('deleteConfirm')),
          ),
        ),
      );
    }

    function scopeLabel(t, scope) {
      return t(scope in DICT.zh ? scope : 'other');
    }

    function SkillsPanelIcon({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 24;
      return h('svg', {
        viewBox: '0 0 24 24', width: edge, height: edge, fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('rect', { x: 3, y: 4, width: 13, height: 9, rx: 2, stroke: 'currentColor', strokeWidth: 1.5, opacity: 0.5 }),
        h('rect', { x: 6, y: 8, width: 13, height: 9, rx: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M9 12h7M9 14.5h4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      );
    }

    function SkillCard(props) {
      const { skill, t, open, onToggle, onCopy, copied, busy, onDelete } = props;
      const off = skill.enabled === false;
      const deletable = skill.scope === 'global' || skill.scope === 'project';
      const policy = [];
      if (skill.modelInvocable === true) policy.push(t('policyModel'));
      if (skill.modelInvocable === false) policy.push(t('policyNoModel'));
      if (skill.userInvocable === true) policy.push(t('policyUser'));
      if (skill.userInvocable === false) policy.push(t('policyNoUser'));

      return h('div', { className: 'si-card', 'data-off': String(off) },
        h('div', {
          className: 'si-cardmain',
          role: 'button',
          tabIndex: 0,
          'aria-expanded': open,
          onClick: () => onToggle.open(skill.name),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggle.open(skill.name);
            }
          },
        },
          h('span', { className: 'si-headline' },
            h('span', { className: 'si-name' }, skill.name),
            h('span', { className: 'si-badge', 'data-scope': skill.scope }, scopeLabel(t, skill.scope)),
            off ? h('span', { className: 'si-badge', 'data-off': 'true' }, t('disabledTag')) : null,
          ),
          h('span', { className: 'si-desc', title: skill.description || '' }, skill.description || '—'),
          skill.path ? h('span', { className: 'si-path', title: skill.path }, skill.path) : null,
          open ? h('span', { className: 'si-body' },
            h('span', { className: 'si-line' },
              h('b', null, t('path') + ': '),
              h('span', { className: 'si-mono' }, skill.path || '—')),
            skill.provider ? h('span', { className: 'si-line' },
              h('b', null, t('provider') + ': '), skill.provider) : null,
            skill.modifiedAt ? h('span', { className: 'si-line' },
              h('b', null, t('modified') + ': '), new Date(skill.modifiedAt).toLocaleString()) : null,
            policy.length ? h('span', { className: 'si-tags' },
              policy.map((label) => h('span', { className: 'si-badge', key: label }, label))) : null,
            skill.path ? h('span', { className: 'si-actions' },
              h('button', {
                type: 'button',
                className: 'si-btn',
                onClick: (event) => { event.stopPropagation(); onCopy(skill.path); },
              }, copied === skill.path ? t('copied') : t('copy')),
              h('button', {
                type: 'button',
                className: 'si-btn',
                onClick: (event) => {
                  event.stopPropagation();
                  fetch(API + '/open', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ path: skill.path }),
                  }).catch(() => {});
                },
              }, t('open')),
              deletable ? h('button', {
                type: 'button',
                className: 'si-btn si-btn-danger',
                onClick: (event) => {
                  event.stopPropagation();
                  onDelete(skill);
                },
              }, t('delete')) : null,
            ) : null,
            h('span', { className: 'si-hint' }, t('switchHint')),
            deletable ? null : h('span', { className: 'si-hint' }, t('deleteUnavailable')),
          ) : null,
        ),
        h('button', {
          type: 'button',
          className: 'si-switch',
          role: 'switch',
          'aria-checked': String(!off),
          'aria-label': skill.name,
          disabled: busy,
          onClick: () => onToggle.flip(skill),
        }, h('span', { className: 'si-knob' })),
      );
    }

    function SkillsPage(props) {
      const t = props && typeof props.t === 'function' ? props.t : (key) => pick(fallbackLocale(), key);
      const [state, setState] = useState({ status: 'loading', data: null, error: null });
      const [query, setQuery] = useState('');
      const [scope, setScope] = useState('all');
      const [expanded, setExpanded] = useState(null);
      const [copied, setCopied] = useState(null);
      const [busy, setBusy] = useState(null);
      const [toast, setToast] = useState(null);
      const [pending, setPending] = useState(null);
      const copyTimer = useRef(null);

      const load = useCallback(async () => {
        setState((previous) => ({ status: 'loading', data: previous.data, error: null }));
        try {
          const response = await fetch(API + '?t=' + Date.now(), { headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          setState({ status: 'ready', data, error: null });
        } catch (error) {
          setState({ status: 'failed', data: null, error: String((error && error.message) || error) });
        }
      }, []);

      useEffect(() => { load(); }, [load]);
      useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

      const data = state.data;
      const skills = data?.skills ?? [];

      const flip = useCallback(async (skill) => {
        const enabled = skill.enabled === false;
        setBusy(skill.name);
        setToast(null);
        setState((previous) => {
          if (!previous.data) return previous;
          return {
            ...previous,
            data: {
              ...previous.data,
              skills: previous.data.skills.map((row) => (row.name === skill.name ? { ...row, enabled } : row)),
            },
          };
        });
        try {
          const response = await fetch(API + '/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: skill.name, enabled }),
          });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const payload = await response.json();
          setState((previous) => {
            if (!previous.data) return previous;
            const disabled = new Set(payload.disabled ?? []);
            return {
              ...previous,
              data: {
                ...previous.data,
                disabled: [...disabled],
                counts: { ...previous.data.counts, disabled: disabled.size },
                skills: previous.data.skills.map((row) => ({ ...row, enabled: !disabled.has(row.name) })),
              },
            };
          });
        } catch (error) {
          setToast(t('toggleFailed') + String((error && error.message) || error));
          await load();
        } finally {
          setBusy(null);
        }
      }, [load, t]);

      const openDelete = useCallback(async (skill) => {
        setToast(null);
        setPending({ skill, preview: null, error: null, busy: false });
        try {
          const response = await fetch(API + '/delete-preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: skill.name }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || ('HTTP ' + response.status));
          setPending((current) => (current && current.skill.name === skill.name
            ? { ...current, preview: payload }
            : current));
        } catch (error) {
          setPending((current) => (current
            ? { ...current, error: String((error && error.message) || error) }
            : current));
        }
      }, []);

      const cancelDelete = useCallback(() => {
        setPending((current) => (current && current.busy ? current : null));
      }, []);

      const confirmDelete = useCallback(async () => {
        const current = pending;
        if (!current || current.busy) return;
        setPending({ ...current, busy: true, error: null });
        try {
          const response = await fetch(API + '/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: current.skill.name }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || ('HTTP ' + response.status));
          setPending(null);
          setToast((payload.method === 'plugin-trash' ? t('deletedToPlugin') : t('deletedTo'))
            + (payload.method === 'plugin-trash' ? payload.trashPath : payload.name));
          await load();
        } catch (error) {
          setPending({
            ...current,
            busy: false,
            error: t('deleteFailed') + String((error && error.message) || error),
          });
        }
      }, [pending, load, t]);

      useEffect(() => {
        if (!pending) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setPending((current) => (current && !current.busy ? null : current));
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [pending]);

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return skills.filter((skill) => {
          if (scope === 'off' && skill.enabled !== false) return false;
          if (scope !== 'all' && scope !== 'off' && skill.scope !== scope) return false;
          if (!needle) return true;
          return [skill.name, skill.description, skill.path]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle));
        });
      }, [skills, query, scope]);

      const chips = [
        { id: 'all', label: t('all'), count: data?.counts?.total ?? 0 },
        { id: 'global', label: t('global'), count: data?.counts?.global ?? 0 },
        { id: 'project', label: t('project'), count: data?.counts?.project ?? 0 },
        { id: 'custom', label: t('custom'), count: data?.counts?.custom ?? 0 },
        { id: 'bundled', label: t('bundled'), count: data?.counts?.bundled ?? 0 },
        { id: 'embedded', label: t('embedded'), count: data?.counts?.embedded ?? 0 },
        { id: 'off', label: t('disabledTag'), count: data?.counts?.disabled ?? 0 },
      ].filter((chip) => chip.id === 'all' || chip.count > 0);

      const onCopy = useCallback((value) => {
        if (!value) return;
        const done = () => {
          setCopied(value);
          if (copyTimer.current) clearTimeout(copyTimer.current);
          copyTimer.current = setTimeout(() => setCopied(null), 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done).catch(done);
        } else {
          done();
        }
      }, []);

      const toggleHandlers = useMemo(() => ({
        open: (name) => setExpanded((current) => (current === name ? null : name)),
        flip,
        remove: openDelete,
      }), [flip, openDelete]);

      return h(React.Fragment, null,
        h('div', { className: 'si-page' },
        h('style', null, CSS),
        h('div', { className: 'si-head si-col' },
          h('div', { className: 'si-headings' },
            h('h1', { className: 'si-title' }, t('title')),
            h('p', { className: 'si-sub' }, t('subtitle')),
            data ? h('div', { className: 'si-ws' },
              t('workspace') + ': ',
              h('code', null, data.workspace?.path ?? '—'),
              data.workspace?.source === 'recent' ? ' (' + t('recent') + ')' : '') : null,
          ),
          h('button', {
            type: 'button', className: 'si-btn', onClick: load, disabled: state.status === 'loading',
          }, t('refresh')),
        ),
        h('div', { className: 'si-toolbar si-col' },
          h('input', {
            className: 'si-input',
            type: 'search',
            placeholder: t('search'),
            value: query,
            onChange: (event) => setQuery(event.target.value),
          }),
          chips.map((chip) => h('button', {
            key: chip.id,
            type: 'button',
            className: 'si-chip',
            'data-active': String(scope === chip.id),
            onClick: () => setScope(chip.id),
          }, chip.label + ' ' + chip.count)),
        ),
        data ? h('div', { className: 'si-counts si-col' }, format(t('count'), data.counts ?? {})) : null,
        data && data.warnings && data.warnings.length > 0
          ? h('div', { className: 'si-counts si-col' }, t('warnings') + data.warnings.join(', '))
          : null,
        h('div', { className: 'si-scroll' },
          state.status === 'failed' ? h('div', { className: 'si-col' },
            h('div', { className: 'si-error' },
              h('div', null, t('failed') + ': ' + state.error),
              h('div', { style: { marginTop: 10 } },
                h('button', { type: 'button', className: 'si-btn', onClick: load }, t('retry'))),
            )) : null,
          toast ? h('div', { className: 'si-col' }, h('div', { className: 'si-toast' }, toast)) : null,
          state.status === 'loading' && !data
            ? h('div', { className: 'si-col' }, h('div', { className: 'si-empty' }, t('loading'))) : null,
          data ? (visible.length === 0
            ? h('div', { className: 'si-col' }, h('div', { className: 'si-empty' }, t('none')))
            : h('div', { className: 'si-list si-col' },
              visible.map((skill) => h(SkillCard, {
                key: skill.name,
                skill,
                t,
                open: expanded === skill.name,
                onToggle: toggleHandlers,
                onCopy,
                onDelete: openDelete,
                copied,
                busy: busy === skill.name,
              })))) : null,
        ),
        ),
        pending ? h(DeleteDialog, { pending, t, onCancel: cancelDelete, onConfirm: confirmDelete }) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        let bound = null;
        const locale = ctx.get('locale');
        if (locale) {
          try {
            ctx.effect(() => locale.register(NS, DICT), 'skills-inventory: dictionary');
          } catch (error) {
            // Registration may be refused; keep the built-in dictionary and say so.
            ctx.logger?.warn?.('skills-inventory: locale dictionary refused: %s', String(error));
          }
          try {
            bound = locale.bind(NS);
          } catch (error) {
            ctx.logger?.warn?.('skills-inventory: locale binding failed: %s', String(error));
          }
        }

        // Resolve per call: the bound translator follows the active locale, so the
        // page follows a language switch without a reload.
        const t = (key) => {
          if (bound) {
            try {
              const value = bound(key);
              if (typeof value === 'string' && value !== key) return value;
            } catch {
              // Fall through to the built-in dictionary.
            }
          }
          return pick(fallbackLocale(), key);
        };

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 5,
          label: () => t('panel'),
          locale: NS,
        }, SkillsPanelIcon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, () => h(SkillsPage, { t })));
      },
    };
  },
});
