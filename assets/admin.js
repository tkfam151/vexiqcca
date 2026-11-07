/* VEX IQ CCA – admin panel.
   Leaderboards are stored as JSON files in the repository (data/boards/<slug>.json).
   The admin panel reads and writes them through the GitHub API with a personal access token,
   and GitHub Pages then serves them to the public board pages. */
(function () {
  'use strict';
  const C = window.CCA;
  const { esc, isNum, parseTime, formatTimeValue, validSlug, toast } = C;

  const root = document.getElementById('admin');
  const headerActions = document.getElementById('header-actions');
  const STORE_KEY = 'cca-admin-config';
  const DIR = 'data/boards';

  const siteBase = location.pathname.replace(/admin(\/.*)?$/, '') || '/';
  const siteUrl = location.origin + siteBase;

  /* ---------------- config ---------------- */
  function guessRepo() {
    const host = location.hostname;
    const m = host.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { owner: '', repo: '' };
    const owner = m[1];
    const seg = siteBase.split('/').filter(Boolean)[0];
    return { owner, repo: seg || owner + '.github.io' };
  }

  function loadCfg() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { /* ignore */ }
    return Object.assign({ token: '', branch: '', remember: true }, guessRepo(), saved || {});
  }
  function saveCfg() {
    const s = JSON.stringify(cfg);
    try {
      if (cfg.remember) { localStorage.setItem(STORE_KEY, s); sessionStorage.removeItem(STORE_KEY); }
      else { sessionStorage.setItem(STORE_KEY, s); localStorage.removeItem(STORE_KEY); }
    } catch (e) { /* ignore */ }
  }
  function clearCfg() {
    try { localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  let cfg = loadCfg();

  /* ---------------- GitHub API ---------------- */
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function gh(method, path, body) {
    const res = await fetch('https://api.github.com' + path, {
      method,
      cache: 'no-store',
      headers: Object.assign({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + cfg.token,
        'X-GitHub-Api-Version': '2022-11-28'
      }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 404) return null;
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      let msg = (data && data.message) || ('GitHub error ' + res.status);
      if (res.status === 403 && /not accessible/i.test(msg)) {
        msg = 'Your token is not allowed to write to ' + cfg.owner + '/' + cfg.repo + '. On GitHub, edit the token: ' +
          'under "Repository access" choose "Only select repositories" and pick ' + cfg.repo +
          ', then under "Repository permissions" set "Contents" to "Read and write". Save the token and try again.';
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const repoPath = () => '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  const filePath = slug => DIR + '/' + slug + '.json';

  async function getBoardFile(slug) {
    const d = await gh('GET', repoPath() + '/contents/' + filePath(slug) + '?ref=' + encodeURIComponent(cfg.branch) + '&t=' + Date.now());
    if (!d) return null;
    return { sha: d.sha, board: JSON.parse(b64decode(d.content)) };
  }
  async function listBoards() {
    const d = await gh('GET', repoPath() + '/contents/' + DIR + '?ref=' + encodeURIComponent(cfg.branch) + '&t=' + Date.now());
    if (!d || !Array.isArray(d)) return [];
    const files = d.filter(f => f.type === 'file' && /\.json$/.test(f.name));
    const out = await Promise.all(files.map(async f => {
      const slug = f.name.replace(/\.json$/, '');
      try {
        const r = await getBoardFile(slug);
        return r ? { slug, board: r.board, sha: r.sha } : null;
      } catch (e) {
        return { slug, board: { title: slug }, sha: f.sha, error: true };
      }
    }));
    return out.filter(Boolean).sort((a, b) => String(b.board.updated || '').localeCompare(String(a.board.updated || '')));
  }
  function putBoard(slug, board, sha, message) {
    return gh('PUT', repoPath() + '/contents/' + filePath(slug), {
      message, branch: cfg.branch, sha: sha || undefined,
      content: b64encode(JSON.stringify(board, null, 2) + '\n')
    });
  }
  function deleteBoardFile(slug, sha, message) {
    return gh('DELETE', repoPath() + '/contents/' + filePath(slug), { message, sha, branch: cfg.branch });
  }

  /* ---------------- helpers ---------------- */
  const uid = p => (p || 'id') + Math.random().toString(36).slice(2, 9);
  const publicUrl = slug => siteUrl + slug;

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function setHeader(html) { headerActions.innerHTML = html || ''; }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Link copied'); }
    catch (e) { window.prompt('Copy this link:', text); }
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + esc(label || 'Working…'); }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  }

  /* ---------------- login view ---------------- */
  function viewLogin(errMsg) {
    setHeader('');
    root.innerHTML = `
      <div class="card card-pad" style="max-width:620px;margin:0 auto">
        <h2>Admin sign in</h2>
        <p class="muted" style="margin-top:4px">Leaderboards are saved straight to this site's GitHub repository, so you sign in with a GitHub access token that can edit it.</p>
        ${errMsg ? `<p class="chip next" style="padding:6px 10px">${esc(errMsg)}</p>` : ''}
        <form id="login" class="section" autocomplete="off">
          <label class="field section"><span>GitHub access token</span>
            <input type="password" id="token" value="${esc(cfg.token)}" placeholder="github_pat_…" required>
          </label>
          <div class="grid-3 section">
            <label class="field"><span>Owner</span><input type="text" id="owner" value="${esc(cfg.owner)}" required></label>
            <label class="field"><span>Repository</span><input type="text" id="repo" value="${esc(cfg.repo)}" required></label>
            <label class="field"><span>Branch</span><input type="text" id="branch" value="${esc(cfg.branch)}" placeholder="auto"></label>
          </div>
          <label class="row section" style="gap:8px"><input type="checkbox" id="remember" ${cfg.remember ? 'checked' : ''}> Remember me on this device</label>
          <button class="btn btn-primary" id="login-btn" type="submit">Sign in</button>
        </form>
        <details>
          <summary><strong>How do I get a token?</strong></summary>
          <ol class="steps">
            <li>On GitHub open <em>Settings → Developer settings → Personal access tokens → Fine-grained tokens</em> and click <em>Generate new token</em>.</li>
            <li>Under <em>Repository access</em> choose <em>Only select repositories</em> and pick this site's repository. (<em>Public repositories</em> is read-only and will not work.)</li>
            <li>Under <em>Repository permissions</em> set <em>Contents</em> to <em>Read and write</em>.</li>
            <li>Generate it, copy it and paste it above. Keep it secret – anyone with it can edit your leaderboards.</li>
          </ol>
        </details>
      </div>`;
    root.querySelector('#login').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = root.querySelector('#login-btn');
      cfg.token = root.querySelector('#token').value.trim();
      cfg.owner = root.querySelector('#owner').value.trim();
      cfg.repo = root.querySelector('#repo').value.trim();
      cfg.branch = root.querySelector('#branch').value.trim();
      cfg.remember = root.querySelector('#remember').checked;
      busy(btn, true, 'Checking…');
      try {
        await signIn();
      } catch (err) {
        busy(btn, false);
        viewLogin(err.message);
      }
    });
  }

  async function signIn() {
    const repo = await gh('GET', repoPath());
    if (!repo) throw new Error('Repository not found, or the token cannot access it.');
    if (repo.permissions && !repo.permissions.push) throw new Error('This token can read the repository but cannot write to it. Give it "Contents: Read and write".');
    if (!cfg.branch) cfg.branch = repo.default_branch || 'main';
    saveCfg();
    await viewList();
  }

  function signOut() {
    if (editor && editor.dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    editor = null;
    cfg.token = '';
    clearCfg();
    viewLogin();
  }

  /* ---------------- list view ---------------- */
  async function viewList() {
    editor = null;
    setHeader(`<a class="btn btn-sm btn-ghost" href="${esc(siteUrl)}" target="_blank" rel="noopener">View site</a>
      <button class="btn btn-sm" data-act="signout">Sign out</button>`);
    root.innerHTML = '<div class="empty"><span class="spinner"></span><p>Loading leaderboards…</p></div>';
    let boards;
    try {
      boards = await listBoards();
    } catch (err) {
      if (err.status === 401) { viewLogin('Your token is no longer valid. Please sign in again.'); return; }
      root.innerHTML = `<div class="card empty"><h2>Could not load leaderboards</h2><p>${esc(err.message)}</p><button class="btn" data-act="reload">Try again</button></div>`;
      return;
    }
    root.innerHTML = `
      <div class="section-title">
        <div><h2>Leaderboards</h2><p class="muted" style="margin:0">Only people with a link can find a leaderboard – they are never listed on the public site.</p></div>
        <button class="btn btn-primary" data-act="new">+ New leaderboard</button>
      </div>
      <div class="board-list">
        ${boards.length ? boards.map(b => `
          <div class="board-item">
            <div class="info">
              <strong>${esc(b.board.title || b.slug)}</strong>
              <code>${esc(publicUrl(b.slug))}</code>
              <div class="sub">${(b.board.matches || []).length} matches · ${(b.board.criteria || []).length} criteria${b.board.updated ? ' · updated ' + esc(new Date(b.board.updated).toLocaleString()) : ''}</div>
            </div>
            <div class="row" style="gap:6px">
              <button class="btn btn-sm" data-act="copy" data-slug="${esc(b.slug)}">Copy link</button>
              <a class="btn btn-sm" href="${esc(publicUrl(b.slug))}" target="_blank" rel="noopener">Open</a>
              <button class="btn btn-sm btn-blue" data-act="edit" data-slug="${esc(b.slug)}">Edit</button>
            </div>
          </div>`).join('') : `
          <div class="card empty"><h2>No leaderboards yet</h2><p>Create your first one to get a shareable link.</p>
          <button class="btn btn-primary" data-act="new">+ New leaderboard</button></div>`}
      </div>`;
  }

  /* ---------------- editor ---------------- */
  let editor = null; // { board, origSlug, sha, dirty, slugTouched }

  function newBoard() {
    return {
      title: '',
      slug: '',
      description: '',
      bestPerTeam: false,
      criteria: [
        { id: uid('c'), name: 'Dinosaurs', type: 'number', order: 'desc', unit: '' },
        { id: uid('c'), name: 'Time', type: 'time', order: 'asc', unit: '' }
      ],
      matches: [],
      updated: null
    };
  }

  async function openEditor(slug) {
    if (!slug) {
      editor = { board: newBoard(), origSlug: null, sha: null, dirty: false, slugTouched: false };
      renderEditor();
      return;
    }
    root.innerHTML = '<div class="empty"><span class="spinner"></span><p>Opening…</p></div>';
    try {
      const f = await getBoardFile(slug);
      if (!f) { toast('That leaderboard no longer exists', true); viewList(); return; }
      const b = f.board;
      b.slug = b.slug || slug;
      b.criteria = b.criteria || [];
      b.matches = b.matches || [];
      editor = { board: b, origSlug: slug, sha: f.sha, dirty: false, slugTouched: true };
      renderEditor();
    } catch (err) {
      toast(err.message, true);
      viewList();
    }
  }

  function markDirty() {
    if (!editor) return;
    editor.dirty = true;
    const d = root.querySelector('#dirty');
    if (d) d.classList.remove('hidden');
  }

  function critRow(c, i, n) {
    return `
      <div class="crit" data-cid="${esc(c.id)}">
        <div class="prio" title="Ranking priority">${i + 1}</div>
        <input type="text" data-cf="name" value="${esc(c.name)}" placeholder="e.g. Dinosaurs" aria-label="Criterion name">
        <select data-cf="type" aria-label="Type">
          <option value="number" ${c.type !== 'time' ? 'selected' : ''}>Number</option>
          <option value="time" ${c.type === 'time' ? 'selected' : ''}>Time</option>
        </select>
        <select data-cf="order" aria-label="Which is better">
          <option value="desc" ${c.order !== 'asc' ? 'selected' : ''}>Higher is better</option>
          <option value="asc" ${c.order === 'asc' ? 'selected' : ''}>Lower is better</option>
        </select>
        <input type="text" data-cf="unit" value="${esc(c.unit || '')}" placeholder="unit" aria-label="Unit" ${c.type === 'time' ? 'disabled' : ''}>
        <div class="acts">
          <button class="btn btn-sm btn-icon" data-act="crit-up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm btn-icon" data-act="crit-down" title="Move down" ${i === n - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-icon btn-danger" data-act="crit-del" title="Remove">✕</button>
        </div>
      </div>`;
  }

  function scoreInputValue(v, c) {
    if (!isNum(v)) return '';
    return c.type === 'time' ? formatTimeValue(v) : String(v);
  }

  function matchRow(m, i, criteria) {
    const p = m.players || [];
    return `
      <tr data-mid="${esc(m.id)}">
        <td class="idx">${i + 1}</td>
        <td class="time-cell"><input type="datetime-local" data-mf="time" value="${esc(m.time || '')}" aria-label="Match start time"></td>
        <td><input type="text" data-mf="p0" value="${esc(p[0] || '')}" placeholder="Player 1" aria-label="Player 1"></td>
        <td><input type="text" data-mf="p1" value="${esc(p[1] || '')}" placeholder="(optional)" aria-label="Player 2"></td>
        ${criteria.map(c => `<td><input type="text" inputmode="decimal" data-score="${esc(c.id)}" data-type="${c.type}"
            value="${esc(scoreInputValue((m.scores || {})[c.id], c))}" placeholder="${c.type === 'time' ? 'm:ss.00' : '0'}" aria-label="${esc(c.name)}"></td>`).join('')}
        <td><button class="btn btn-sm btn-icon btn-danger" data-act="match-del" title="Delete match">✕</button></td>
      </tr>`;
  }

  function renderCriteria() {
    const b = editor.board;
    root.querySelector('#crit-list').innerHTML = b.criteria.length
      ? b.criteria.map((c, i) => critRow(c, i, b.criteria.length)).join('')
      : '<p class="muted">No criteria yet. Add at least one so players can be ranked.</p>';
  }

  function renderMatches() {
    const b = editor.board;
    const crit = b.criteria;
    root.querySelector('#match-table').innerHTML = `
      <thead><tr><th>#</th><th>Match start time</th><th>Player 1</th><th>Player 2</th>
        ${crit.map(c => `<th>${esc(c.name || 'Untitled')}${c.type === 'time' ? ' <span class="muted">(time)</span>' : ''}</th>`).join('')}<th></th></tr></thead>
      <tbody>${b.matches.length ? b.matches.map((m, i) => matchRow(m, i, crit)).join('')
        : `<tr><td colspan="${crit.length + 5}" class="muted" style="padding:16px">No matches yet. Click “Add match”.</td></tr>`}</tbody>`;
    root.querySelector('#match-count').textContent = b.matches.length + (b.matches.length === 1 ? ' match' : ' matches');
  }

  function renderEditor() {
    const b = editor.board;
    setHeader(`<button class="btn btn-sm" data-act="signout">Sign out</button>`);
    root.innerHTML = `
      <div class="section-title">
        <div class="row" style="gap:8px">
          <button class="btn btn-sm btn-ghost" data-act="back">← All leaderboards</button>
        </div>
      </div>
      <h2 style="margin-bottom:16px">${editor.origSlug ? 'Edit leaderboard' : 'New leaderboard'}</h2>

      <div class="card card-pad section">
        <div class="section-title"><h3>Details</h3></div>
        <div class="grid-2 section">
          <label class="field"><span>Title</span>
            <input type="text" id="f-title" value="${esc(b.title)}" placeholder="e.g. Dino Rescue Challenge">
          </label>
          <label class="field"><span>Custom link</span>
            <div class="url-preview"><span class="prefix" title="${esc(siteUrl)}">${esc(siteUrl)}</span>
              <input type="text" id="f-slug" value="${esc(b.slug)}" placeholder="dino-rescue" spellcheck="false" autocapitalize="off"></div>
            <div class="hint" id="slug-hint"></div>
          </label>
        </div>
        <label class="field section"><span>Description <span class="muted">(optional)</span></span>
          <textarea id="f-desc" placeholder="Shown under the title on the leaderboard page">${esc(b.description || '')}</textarea>
        </label>
        <label class="row" style="gap:8px"><input type="checkbox" id="f-best" ${b.bestPerTeam ? 'checked' : ''}>
          Show only each player/team's best match on the leaderboard</label>
      </div>

      <div class="card card-pad section">
        <div class="section-title">
          <div><h3>Scoring criteria</h3>
          <p class="hint" style="margin:0">Players are ranked by criterion 1 first; ties are broken by criterion 2, then 3, and so on.</p></div>
          <button class="btn btn-sm" data-act="crit-add">+ Add criterion</button>
        </div>
        <div class="crit-list" id="crit-list"></div>
      </div>

      <div class="card card-pad section">
        <div class="section-title">
          <div><h3>Matches</h3>
          <p class="hint" style="margin:0"><span id="match-count"></span> · Leave Player 2 empty for a solo match. Leave scores empty until the match is played. Times can be typed as <code>83.5</code> or <code>1:23.5</code>.</p></div>
          <div class="row" style="gap:6px">
            <button class="btn btn-sm" data-act="match-sort">Sort by time</button>
            <button class="btn btn-sm btn-blue" data-act="match-add">+ Add match</button>
          </div>
        </div>
        <div class="table-wrap"><table class="edit" id="match-table"></table></div>
      </div>

      ${editor.origSlug ? `
      <div class="card card-pad section">
        <div class="section-title"><div><h3>Danger zone</h3><p class="hint" style="margin:0">Deleting removes the leaderboard and its link for everyone.</p></div>
        <button class="btn btn-sm btn-danger" data-act="delete">Delete leaderboard</button></div>
      </div>` : ''}

      <div class="sticky-bar"><div class="wrap" style="padding:0">
        <button class="btn btn-primary" data-act="save">Save &amp; publish</button>
        ${editor.origSlug ? `<button class="btn" data-act="copy" data-slug="${esc(editor.origSlug)}">Copy link</button>
        <a class="btn" href="${esc(publicUrl(editor.origSlug))}" target="_blank" rel="noopener">Open public page</a>` : ''}
        <span id="dirty" class="muted ${editor.dirty ? '' : 'hidden'}"><span class="dirty-dot"></span> Unsaved changes</span>
        <span class="hint grow" style="margin:0;text-align:right">Changes appear on the public page about a minute after saving.</span>
      </div></div>`;
    renderCriteria();
    renderMatches();
    updateSlugHint();
  }

  function updateSlugHint() {
    const el = root.querySelector('#slug-hint');
    if (!el) return;
    const slug = editor.board.slug;
    if (!slug) { el.textContent = 'Letters, numbers and dashes. This is the link you share.'; el.style.color = ''; return; }
    if (!validSlug(slug)) {
      el.textContent = C.RESERVED_SLUGS.includes(slug) ? '“' + slug + '” is reserved – pick another.' : 'Use lowercase letters, numbers, - or _ (max 60).';
      el.style.color = 'var(--accent)';
      return;
    }
    el.innerHTML = 'Link: <strong>' + esc(publicUrl(slug)) + '</strong>';
    el.style.color = '';
  }

  /* ---------------- editor events ---------------- */
  root.addEventListener('input', e => {
    if (!editor) return;
    const t = e.target;
    const b = editor.board;
    if (t.id === 'f-title') {
      b.title = t.value;
      if (!editor.slugTouched) {
        b.slug = slugify(t.value);
        root.querySelector('#f-slug').value = b.slug;
        updateSlugHint();
      }
    } else if (t.id === 'f-slug') {
      const clean = t.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
      if (clean !== t.value) t.value = clean;
      b.slug = clean;
      editor.slugTouched = true;
      updateSlugHint();
    } else if (t.id === 'f-desc') {
      b.description = t.value;
    } else if (t.dataset.cf === 'name' || t.dataset.cf === 'unit') {
      const c = b.criteria.find(x => x.id === t.closest('[data-cid]').dataset.cid);
      c[t.dataset.cf] = t.value;
      if (t.dataset.cf === 'name') {
        const idx = b.criteria.indexOf(c);
        const th = root.querySelectorAll('#match-table thead th')[4 + idx];
        if (th) th.innerHTML = esc(c.name || 'Untitled') + (c.type === 'time' ? ' <span class="muted">(time)</span>' : '');
      }
    } else if (t.dataset.mf) {
      const m = b.matches.find(x => x.id === t.closest('[data-mid]').dataset.mid);
      if (t.dataset.mf === 'time') m.time = t.value;
      else {
        m.players = m.players || ['', ''];
        m.players[t.dataset.mf === 'p0' ? 0 : 1] = t.value;
      }
    } else if (t.dataset.score) {
      const v = t.dataset.type === 'time' ? parseTime(t.value) : (t.value.trim() === '' ? null : Number(t.value.trim()));
      t.classList.toggle('invalid', v !== null && !isNum(v));
    } else {
      return;
    }
    markDirty();
  });

  root.addEventListener('change', e => {
    if (!editor) return;
    const t = e.target;
    const b = editor.board;
    if (t.id === 'f-best') { b.bestPerTeam = t.checked; markDirty(); return; }
    if (t.dataset.cf === 'type' || t.dataset.cf === 'order') {
      const c = b.criteria.find(x => x.id === t.closest('[data-cid]').dataset.cid);
      c[t.dataset.cf] = t.value;
      if (t.dataset.cf === 'type') {
        if (t.value === 'time' && c.order !== 'asc') c.order = 'asc';
        renderCriteria();
        renderMatches();
      }
      markDirty();
      return;
    }
    if (t.dataset.score) {
      const m = b.matches.find(x => x.id === t.closest('[data-mid]').dataset.mid);
      const c = b.criteria.find(x => x.id === t.dataset.score);
      const raw = t.value.trim();
      const v = c.type === 'time' ? parseTime(raw) : (raw === '' ? null : Number(raw));
      m.scores = m.scores || {};
      if (v === null) { delete m.scores[c.id]; t.classList.remove('invalid'); }
      else if (isNum(v)) { m.scores[c.id] = v; t.value = scoreInputValue(v, c); t.classList.remove('invalid'); }
      else { t.classList.add('invalid'); }
      markDirty();
    }
  });

  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) handleAction(btn.dataset.act, btn);
  });
  headerActions.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) handleAction(btn.dataset.act, btn);
  });

  function handleAction(act, btn) {
    const b = editor && editor.board;
    switch (act) {
      case 'signout': signOut(); break;
      case 'reload': viewList(); break;
      case 'new': openEditor(null); break;
      case 'edit': openEditor(btn.dataset.slug); break;
      case 'copy': copy(publicUrl(btn.dataset.slug)); break;
      case 'back':
        if (editor.dirty && !confirm('Discard unsaved changes?')) return;
        viewList();
        break;
      case 'crit-add':
        b.criteria.push({ id: uid('c'), name: '', type: 'number', order: 'desc', unit: '' });
        renderCriteria(); renderMatches(); markDirty();
        root.querySelector('#crit-list .crit:last-child input').focus();
        break;
      case 'crit-up': case 'crit-down': {
        const id = btn.closest('[data-cid]').dataset.cid;
        const i = b.criteria.findIndex(c => c.id === id);
        const j = act === 'crit-up' ? i - 1 : i + 1;
        if (j < 0 || j >= b.criteria.length) return;
        [b.criteria[i], b.criteria[j]] = [b.criteria[j], b.criteria[i]];
        renderCriteria(); renderMatches(); markDirty();
        break;
      }
      case 'crit-del': {
        const id = btn.closest('[data-cid]').dataset.cid;
        const c = b.criteria.find(x => x.id === id);
        const used = b.matches.some(m => isNum((m.scores || {})[id]));
        if (used && !confirm('Remove “' + (c.name || 'Untitled') + '” and all scores entered for it?')) return;
        b.criteria = b.criteria.filter(x => x.id !== id);
        b.matches.forEach(m => { if (m.scores) delete m.scores[id]; });
        renderCriteria(); renderMatches(); markDirty();
        break;
      }
      case 'match-add': {
        const last = b.matches[b.matches.length - 1];
        let time = '';
        if (last && last.time) {
          const d = new Date(last.time);
          if (!isNaN(d)) {
            d.setMinutes(d.getMinutes() + 5);
            const pad = n => String(n).padStart(2, '0');
            time = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
          }
        }
        b.matches.push({ id: uid('m'), time, players: ['', ''], scores: {} });
        renderMatches(); markDirty();
        const rows = root.querySelectorAll('#match-table tbody tr');
        const input = rows[rows.length - 1].querySelector(time ? '[data-mf="p0"]' : '[data-mf="time"]');
        input.focus();
        break;
      }
      case 'match-sort':
        b.matches.sort((x, y) => String(x.time || '~').localeCompare(String(y.time || '~')));
        renderMatches(); markDirty();
        break;
      case 'match-del': {
        const id = btn.closest('[data-mid]').dataset.mid;
        const m = b.matches.find(x => x.id === id);
        if ((C.hasScore(m, b.criteria) || (m.players || []).some(p => p.trim())) && !confirm('Delete this match?')) return;
        b.matches = b.matches.filter(x => x.id !== id);
        renderMatches(); markDirty();
        break;
      }
      case 'save': save(btn); break;
      case 'delete': removeBoard(btn); break;
    }
  }

  function cleanBoard(b) {
    return {
      slug: b.slug,
      title: b.title.trim(),
      description: (b.description || '').trim(),
      bestPerTeam: !!b.bestPerTeam,
      criteria: b.criteria.map(c => ({ id: c.id, name: c.name.trim() || 'Untitled', type: c.type === 'time' ? 'time' : 'number', order: c.order === 'asc' ? 'asc' : 'desc', unit: c.type === 'time' ? '' : (c.unit || '').trim() })),
      matches: b.matches.map(m => {
        const scores = {};
        b.criteria.forEach(c => { if (isNum((m.scores || {})[c.id])) scores[c.id] = m.scores[c.id]; });
        return { id: m.id, time: m.time || '', players: (m.players || []).map(p => String(p).trim()).filter(Boolean), scores };
      }),
      updated: new Date().toISOString()
    };
  }

  async function save(btn) {
    const b = editor.board;
    if (!b.title.trim()) { toast('Give the leaderboard a title', true); root.querySelector('#f-title').focus(); return; }
    if (!validSlug(b.slug)) { toast('Choose a valid custom link', true); root.querySelector('#f-slug').focus(); return; }
    // Make sure a score field that still has focus has been committed.
    if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.score) {
      document.activeElement.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (root.querySelector('input.invalid')) { toast('Fix the highlighted scores first', true); root.querySelector('input.invalid').focus(); return; }
    const data = cleanBoard(b);
    busy(btn, true, 'Saving…');
    try {
      const renamed = editor.origSlug && editor.origSlug !== data.slug;
      if (!editor.origSlug || renamed) {
        const existing = await gh('GET', repoPath() + '/contents/' + filePath(data.slug) + '?ref=' + encodeURIComponent(cfg.branch));
        if (existing) throw new Error('The link “' + data.slug + '” is already used by another leaderboard.');
      }
      const res = await putBoard(data.slug, data, renamed ? null : editor.sha,
        (editor.origSlug ? 'Update' : 'Create') + ' leaderboard: ' + data.title);
      if (renamed) {
        await deleteBoardFile(editor.origSlug, editor.sha, 'Rename leaderboard ' + editor.origSlug + ' → ' + data.slug);
      }
      editor.sha = res.content.sha;
      editor.origSlug = data.slug;
      editor.dirty = false;
      editor.board = Object.assign({}, data);
      renderEditor();
      toast(renamed ? 'Saved – the old link no longer works' : 'Saved & published');
    } catch (err) {
      busy(btn, false);
      if (err.status === 409) toast('Someone else changed this leaderboard. Reload it and try again.', true);
      else if (err.status === 401) toast('Your token is no longer valid – sign in again.', true);
      else if (err.status === 403) alert('Save failed.\n\n' + err.message);
      else toast('Save failed: ' + err.message, true);
    }
  }

  async function removeBoard(btn) {
    const name = editor.board.title || editor.origSlug;
    if (!confirm('Delete “' + name + '”? Its link will stop working. This cannot be undone.')) return;
    busy(btn, true, 'Deleting…');
    try {
      await deleteBoardFile(editor.origSlug, editor.sha, 'Delete leaderboard: ' + name);
      editor.dirty = false;
      toast('Leaderboard deleted');
      viewList();
    } catch (err) {
      busy(btn, false);
      if (err.status === 403) alert('Delete failed.\n\n' + err.message);
      else toast('Delete failed: ' + err.message, true);
    }
  }

  window.addEventListener('beforeunload', e => {
    if (editor && editor.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- start ---------------- */
  if (cfg.token && cfg.owner && cfg.repo) {
    root.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
    signIn().catch(err => viewLogin(err.message));
  } else {
    viewLogin();
  }
})();
