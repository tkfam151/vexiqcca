/* VEX IQ CCA – shared helpers used by the public board page and the admin panel. */
(function (global) {
  'use strict';

  const RESERVED_SLUGS = ['admin', 'assets', 'data', 'index', '404', 'board'];
  const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* "1:23.45" -> 83.45, "83.45" -> 83.45, "1:02:03" -> 3723, "" -> null, bad -> NaN */
  function parseTime(str) {
    str = String(str == null ? '' : str).trim().replace(/s$/i, '').trim();
    if (str === '') return null;
    const parts = str.split(':');
    if (parts.length > 3) return NaN;
    let total = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (!/^\d+(\.\d+)?$/.test(p)) return NaN;
      const n = parseFloat(p);
      if (i > 0 && n >= 60) return NaN;
      total = total * 60 + n;
    }
    return Math.round(total * 1000) / 1000;
  }

  function trimNum(n, maxDec) {
    return String(Math.round(n * Math.pow(10, maxDec)) / Math.pow(10, maxDec));
  }

  /* 83.45 -> "1:23.45", 9.5 -> "9.5" */
  function formatTimeValue(sec) {
    if (!isNum(sec)) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round((sec % 60) * 1000) / 1000;
    let sStr = trimNum(s, 3);
    if (h === 0 && m === 0) return sStr;
    if (s < 10) sStr = '0' + sStr;
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + sStr : m + ':' + sStr;
  }

  function formatValue(v, crit) {
    if (!isNum(v)) return '—';
    if (crit.type === 'time') {
      const t = formatTimeValue(v);
      return v < 60 ? t + 's' : t;
    }
    return trimNum(v, 3) + (crit.unit ? ' ' + crit.unit : '');
  }

  function hasScore(match, criteria) {
    const sc = match.scores || {};
    return criteria.some(c => isNum(sc[c.id]));
  }

  function cmpVal(a, b, order) {
    const an = !isNum(a), bn = !isNum(b);
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    return order === 'asc' ? a - b : b - a;
  }

  function teamKey(m) {
    return (m.players || []).map(p => String(p).trim().toLowerCase()).filter(Boolean).sort().join('|');
  }

  /* Returns [{match, rank}] sorted best-first, using criteria order as priority. */
  function rankMatches(board) {
    const criteria = board.criteria || [];
    const cmp = (x, y) => {
      for (const c of criteria) {
        const r = cmpVal((x.scores || {})[c.id], (y.scores || {})[c.id], c.order);
        if (r) return r;
      }
      return 0;
    };
    let rows = (board.matches || []).filter(m => hasScore(m, criteria));
    rows.sort((x, y) => cmp(x, y) || String(x.time || '').localeCompare(String(y.time || '')));
    if (board.bestPerTeam) {
      const seen = new Set();
      rows = rows.filter(m => {
        const k = teamKey(m);
        if (!k) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    const out = [];
    rows.forEach((m, i) => {
      const rank = i > 0 && cmp(rows[i - 1], m) === 0 ? out[i - 1].rank : i + 1;
      out.push({ match: m, rank });
    });
    return out;
  }

  /* "2026-11-07T10:30" is stored as local wall-clock time (no timezone). */
  function parseLocal(s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function fmtClock(s) {
    const d = parseLocal(s);
    return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'TBD';
  }
  function fmtDay(s) {
    const d = parseLocal(s);
    return d ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  }

  function playersHtml(players) {
    const list = (players || []).map(p => String(p).trim()).filter(Boolean);
    if (!list.length) return '<span class="muted">Unnamed</span>';
    return list.map(esc).join(' <span class="amp">&amp;</span> ');
  }

  function toast(msg, isError) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 6000 : 2800);
  }

  function validSlug(slug) {
    return SLUG_RE.test(slug) && RESERVED_SLUGS.indexOf(slug) === -1;
  }

  global.CCA = {
    esc, isNum, parseTime, formatTimeValue, formatValue, hasScore, rankMatches,
    parseLocal, fmtClock, fmtDay, playersHtml, toast, validSlug, teamKey,
    RESERVED_SLUGS, SLUG_RE
  };
})(window);
