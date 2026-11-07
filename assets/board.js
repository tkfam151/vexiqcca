/* VEX IQ CCA – public leaderboard page (served at <site>/<slug>). */
(function () {
  'use strict';
  const { esc, isNum, formatValue, hasScore, rankMatches, fmtClock, fmtDay, parseLocal, playersHtml } = window.CCA;

  const app = document.getElementById('app');
  const slug = window.CCA_SLUG || '';
  const REFRESH_MS = 30000;

  let board = null;
  let tab = 'board';
  let query = '';
  try { tab = sessionStorage.getItem('cca-tab-' + slug) || 'board'; } catch (e) { /* ignore */ }

  function notFound() {
    document.title = 'Not found · VEX IQ CCA';
    app.innerHTML =
      '<div class="empty"><h2>Leaderboard not found</h2>' +
      '<p>Check the link you were given, or ask your event organizer for the correct one.</p>' +
      '<p><a class="btn" href="./">Go to home page</a></p></div>';
  }

  async function load(initial) {
    if (!slug || !window.CCA.SLUG_RE.test(slug) || window.CCA.RESERVED_SLUGS.includes(slug)) {
      notFound();
      return;
    }
    try {
      const res = await fetch('data/boards/' + encodeURIComponent(slug) + '.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) { if (initial) notFound(); return; }
      board = await res.json();
      render();
    } catch (e) {
      if (initial) notFound();
    }
  }

  function matchesQuery(m) {
    if (!query) return true;
    return (m.players || []).some(p => String(p).toLowerCase().includes(query));
  }

  function scoreSummary(m, criteria) {
    return criteria
      .filter(c => isNum((m.scores || {})[c.id]))
      .map(c => esc(c.name) + ': <strong>' + esc(formatValue(m.scores[c.id], c)) + '</strong>')
      .join(' · ');
  }

  function renderBoard() {
    const criteria = board.criteria || [];
    const ranked = rankMatches(board);
    if (!ranked.length) {
      return '<div class="card empty"><h2>No results yet</h2><p>Scores will appear here once matches are played. Check the match schedule for your start time.</p></div>';
    }
    const places = ['1st', '2nd', '3rd'];
    let podium = '';
    if (!query && ranked.length >= 3 && criteria.length) {
      podium = '<div class="podium">' + ranked.slice(0, 3).map((r, i) =>
        '<div class="p p' + Math.min(r.rank, 3) + '"><div class="place">' + places[Math.min(r.rank, 3) - 1] + ' place</div>' +
        '<div class="who">' + playersHtml(r.match.players) + '</div>' +
        '<div class="what">' + scoreSummary(r.match, criteria) + '</div></div>'
      ).join('') + '</div>';
    }
    const rows = ranked.filter(r => matchesQuery(r.match));
    const head = '<tr><th>#</th><th>Player(s)</th>' +
      criteria.map(c => '<th class="num">' + esc(c.name) + '</th>').join('') +
      '<th class="num">Match time</th></tr>';
    const body = rows.length ? rows.map(r => {
      const m = r.match;
      return '<tr' + (query ? ' class="hl"' : '') + '><td class="rank rank-' + r.rank + '">' + r.rank + '</td>' +
        '<td class="players">' + playersHtml(m.players) + '</td>' +
        criteria.map(c => '<td class="num">' + esc(formatValue((m.scores || {})[c.id], c)) + '</td>').join('') +
        '<td class="num sub">' + esc(fmtClock(m.time)) + '</td></tr>';
    }).join('') : '<tr><td colspan="' + (criteria.length + 3) + '" class="muted">No players match “' + esc(query) + '”.</td></tr>';
    return podium + '<div class="card table-wrap"><table class="lb"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderSchedule() {
    const criteria = board.criteria || [];
    const list = (board.matches || []).slice().sort((a, b) => String(a.time || '~').localeCompare(String(b.time || '~')));
    if (!list.length) {
      return '<div class="card empty"><h2>No matches scheduled yet</h2><p>Check back soon for your match time.</p></div>';
    }
    const nextIdx = list.findIndex(m => !hasScore(m, criteria) && m.time);
    const days = new Set(list.map(m => fmtDay(m.time)).filter(Boolean));
    const now = new Date();
    const shown = list.map((m, i) => ({ m, i })).filter(x => matchesQuery(x.m));
    if (!shown.length) return '<div class="card empty"><p>No matches found for “' + esc(query) + '”.</p></div>';
    return '<div class="schedule">' + shown.map(({ m, i }) => {
      const done = hasScore(m, criteria);
      const isNext = i === nextIdx;
      const t = parseLocal(m.time);
      let chip;
      if (done) chip = '<span class="chip good">Played</span>';
      else if (isNext) chip = '<span class="chip next">' + (t && t <= now ? 'On now' : 'Up next') + '</span>';
      else chip = '<span class="chip">Upcoming</span>';
      const count = (m.players || []).filter(p => String(p).trim()).length;
      return '<div class="match' + (done ? ' is-done' : '') + (isNext ? ' is-next' : '') + '">' +
        '<div class="when"><div class="t">' + esc(fmtClock(m.time)) + '</div>' +
        (days.size > 1 || !t ? '<div class="d">' + esc(fmtDay(m.time)) + '</div>' : '') + '</div>' +
        '<div class="who"><div class="players">' + playersHtml(m.players) + '</div>' +
        '<div class="res">' + (done ? scoreSummary(m, criteria) : (count === 2 ? 'Team of 2' : count === 1 ? 'Solo' : '')) + '</div></div>' +
        '<div>' + chip + '</div></div>';
    }).join('') + '</div>';
  }

  function render() {
    document.title = (board.title || 'Leaderboard') + ' · VEX IQ CCA';
    const scroll = window.scrollY;
    const focused = document.activeElement && document.activeElement.id === 'q';
    const caret = focused ? document.activeElement.selectionStart : null;
    const updated = board.updated ? new Date(board.updated) : null;
    app.innerHTML =
      '<section class="board-head"><span class="chip blue">Leaderboard</span>' +
      '<h1>' + esc(board.title || 'Leaderboard') + '</h1>' +
      (board.description ? '<p>' + esc(board.description) + '</p>' : '') + '</section>' +
      '<div class="toolbar"><div class="tabs" role="tablist">' +
      '<button class="tab" role="tab" data-tab="board" aria-selected="' + (tab === 'board') + '">Leaderboard</button>' +
      '<button class="tab" role="tab" data-tab="schedule" aria-selected="' + (tab === 'schedule') + '">Match schedule</button></div>' +
      '<input class="search" id="q" type="search" placeholder="Find your name…" aria-label="Find your name" value="' + esc(query) + '"></div>' +
      '<div id="panel">' + (tab === 'board' ? renderBoard() : renderSchedule()) + '</div>' +
      '<p class="updated">' + (updated && !isNaN(updated) ? 'Last updated ' + esc(updated.toLocaleString()) + ' · ' : '') + 'Refreshes automatically</p>';
    if (focused) {
      const q = document.getElementById('q');
      q.focus();
      if (caret != null) q.setSelectionRange(caret, caret);
    }
    window.scrollTo(0, scroll);
  }

  app.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    tab = t.dataset.tab;
    try { sessionStorage.setItem('cca-tab-' + slug, tab); } catch (err) { /* ignore */ }
    render();
  });
  app.addEventListener('input', e => {
    if (e.target.id !== 'q') return;
    query = e.target.value.trim().toLowerCase();
    document.getElementById('panel').innerHTML = tab === 'board' ? renderBoard() : renderSchedule();
  });

  load(true);
  setInterval(() => { if (!document.hidden) load(false); }, REFRESH_MS);
})();
