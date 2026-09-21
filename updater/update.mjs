#!/usr/bin/env node
/* ==========================================================================
   updater/update.mjs — weekly job collector
   Deterministic: HTTP requests to permitted public APIs/feeds + parsing +
   keyword rules from profile.js/matcher.js. NO AI, NO LLM, NO paid AI service.

   Runs in GitHub Actions (Node 20+, no npm install needed).
   Local use (optional, developers only):
     node updater/update.mjs            normal run, writes jobs.json + jobs.js
     node updater/update.mjs --dry-run  collect and report, write nothing
     node updater/update.mjs --test     use updater/test-fixture.json, write updater/test-output.json
     node updater/update.mjs --only=adzuna,jooble
   ========================================================================== */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, 'matcher.js'));
const P = require(path.join(ROOT, 'profile.js'));

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const TEST = ARGS.includes('--test');
const ONLY = (ARGS.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);

const CONFIG = JSON.parse(await fs.readFile(path.join(__dirname, 'sources.json'), 'utf8'));
const SET = CONFIG.settings;
const UA = SET.userAgent;
const NOW = new Date();
const DAY = 86400000;

class SkipError extends Error {}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const redact = s => String(s).replace(/(app_id|app_key|api_key|key)=[^&\s]+/gi, '$1=***').replace(/jooble\.org\/api\/[^\s/"]+/g, 'jooble.org/api/***');

/* ------------------------------------------------------------------- HTTP */
async function http(url, { method = 'GET', headers = {}, body, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method, body,
        headers: { 'User-Agent': UA, 'Accept': 'application/json, application/xml, text/xml, text/html;q=0.8', ...headers },
        signal: AbortSignal.timeout(SET.requestTimeoutMs)
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) throw new SkipError(`HTTP ${res.status}: access refused (check key, or the site does not allow automated access)`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (e instanceof SkipError) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(redact(`${lastErr && lastErr.message} — ${url}`));
}

/* ------------------------------------------------------------- robots.txt */
const robotsCache = new Map();
function parseRobots(txt) {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false;
    if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && UA.toLowerCase().includes(a)));
  const star = groups.filter(g => g.agents.includes('*'));
  return (mine.length ? mine : star).flatMap(g => g.rules);
}
function robotsAllows(rules, p) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
async function checkRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const r = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      if (r.ok) rules = parseRobots(await r.text());
      else if (r.status >= 500) rules = [{ allow: false, path: '/' }];
    } catch { /* unreachable robots.txt: treat as no rules */ }
    robotsCache.set(u.origin, rules);
  }
  if (!robotsAllows(robotsCache.get(u.origin), u.pathname + u.search)) {
    throw new SkipError(`robots.txt disallows ${u.origin}${u.pathname} — skipped`);
  }
}

/* ------------------------------------------------------------ text helpers */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', hellip: '…' };
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
function clean(s) {
  return decode(decode(s))
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ').replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function isoDate(v) {
  if (!v) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  const s = String(v).trim();
  const rel = s.match(/posted\s+(today|yesterday|(\d+)\+?\s+days?\s+ago)/i);
  if (rel) { const d = rel[1].toLowerCase() === 'today' ? 0 : rel[1].toLowerCase() === 'yesterday' ? 1 : +rel[2]; return new Date(NOW - d * DAY).toISOString(); }
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString();
}
function annual(n, period) {
  if (!n || isNaN(n)) return null;
  const p = String(period || '').toLowerCase();
  if (/hour/.test(p) || (!p && n < 200)) return Math.round(n * 2000);
  if (/week/.test(p)) return Math.round(n * 52);
  if (/month/.test(p)) return Math.round(n * 12);
  return Math.round(n);
}
function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-CA'); }
function salaryText(min, max, estimated, raw) {
  if (min || max) {
    const t = min && max && min !== max ? `${fmtMoney(min)}–${fmtMoney(max)}` : fmtMoney(min || max);
    return t + ' / year' + (estimated ? ' (estimate)' : '');
  }
  return raw ? clean(raw) : '';
}
function parseSalaryString(s) {
  const t = String(s || '').replace(/,/g, '');
  const nums = [...t.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k)?/gi)].map(m => +m[1] * (m[2] ? 1000 : 1)).filter(n => n >= 15);
  if (!nums.length) return {};
  const period = /hour|hr/i.test(t) ? 'hour' : /month/i.test(t) ? 'month' : /week/i.test(t) ? 'week' : 'year';
  return { min: annual(Math.min(...nums), period), max: annual(Math.max(...nums), period) };
}
function validUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.toString() : ''; } catch { return ''; } }
function canonicalUrl(u) {
  try { const x = new URL(u); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'se', 'v', 'ref', 'source'].forEach(k => x.searchParams.delete(k)); x.hash = ''; return x.toString().replace(/\/$/, '').toLowerCase(); }
  catch { return ''; }
}
function titlePrefilter(title) {
  const t = M.norm(title);
  return !!(M.matchEntries(t, P.targetTitles.primary).length || M.matchEntries(t, P.targetTitles.related).length || M.matchEntries(t, P.titleFamilyWords).length);
}

/* --------------------------------------------------------------- adapters */
// Each adapter returns raw job objects:
// { postingId, title, company, location, url, datePosted, validThrough, salaryMin, salaryMax,
//   salaryEstimated, salaryRaw, employmentType, workplace, description }
const ADAPTERS = {
  async adzuna(src) {
    const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
    if (!id || !key) throw new SkipError('Secrets ADZUNA_APP_ID / ADZUNA_APP_KEY are not set');
    const out = [];
    for (const q of CONFIG.queries) {
      for (let page = 1; page <= (src.pages || 1); page++) {
        const u = new URL(`https://api.adzuna.com/v1/api/jobs/ca/search/${page}`);
        Object.entries({
          app_id: id, app_key: key, what: q, where: src.where || 'Toronto, Ontario',
          distance: src.distanceKm || 70, max_days_old: src.maxDaysOld || 45,
          results_per_page: 50, sort_by: 'date', 'content-type': 'application/json'
        }).forEach(([k, v]) => u.searchParams.set(k, v));
        const data = await (await http(u.toString())).json();
        const rows = data.results || [];
        for (const r of rows) {
          const estimated = String(r.salary_is_predicted) === '1';
          out.push({
            postingId: 'adzuna:' + r.id, title: r.title, company: r.company && r.company.display_name,
            location: [r.location && r.location.display_name].concat((r.location && r.location.area) || []).filter(Boolean).join(', '),
            displayLocation: r.location && r.location.display_name,
            url: r.redirect_url, datePosted: r.created,
            salaryMin: annual(r.salary_min), salaryMax: annual(r.salary_max), salaryEstimated: estimated,
            employmentType: [r.contract_time, r.contract_type].filter(Boolean).join(' '),
            description: r.description
          });
        }
        await sleep(SET.requestDelayMs);
        if (rows.length < 50) break;
      }
    }
    return out;
  },

  async jooble(src) {
    const key = process.env.JOOBLE_API_KEY;
    if (!key) throw new SkipError('Secret JOOBLE_API_KEY is not set');
    const out = [];
    for (const q of CONFIG.queries) {
      for (let page = 1; page <= (src.pages || 1); page++) {
        const res = await http(`https://jooble.org/api/${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: q, location: src.location || 'Toronto, ON', radius: String(src.radiusKm || 80), page: String(page) })
        });
        const data = await res.json();
        for (const r of data.jobs || []) {
          const sal = parseSalaryString(r.salary);
          out.push({
            postingId: 'jooble:' + r.id, title: r.title, company: r.company, location: r.location,
            url: r.link, datePosted: r.updated, salaryMin: sal.min, salaryMax: sal.max, salaryRaw: r.salary,
            employmentType: r.type, description: r.snippet, via: r.source
          });
        }
        await sleep(SET.requestDelayMs);
        if (!(data.jobs || []).length) break;
      }
    }
    return out;
  },

  async workday(src) {
    if (/TENANT|SITE_NAME/.test(src.host + src.site + src.tenant)) throw new SkipError('Workday source still has placeholder values');
    const api = `https://${src.host}/wday/cxs/${src.tenant}/${src.site}`;
    await checkRobots(api + '/jobs');
    const seen = new Map();
    for (const q of CONFIG.queries) {
      for (let offset = 0; offset < 100; offset += 20) {
        const res = await http(api + '/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q })
        });
        const data = await res.json();
        const rows = data.jobPostings || [];
        for (const r of rows) if (r.externalPath && !seen.has(r.externalPath)) seen.set(r.externalPath, r);
        await sleep(SET.requestDelayMs);
        if (rows.length < 20) break;
      }
    }
    const out = [];
    for (const [p, r] of seen) {
      if (!titlePrefilter(r.title)) continue;
      const job = {
        postingId: `workday:${src.tenant}:${(r.bulletFields || [])[0] || p}`, title: r.title, company: src.company,
        location: r.locationsText, url: `https://${src.host}/${src.site}${p}`, datePosted: isoDate(r.postedOn), description: ''
      };
      if (src.fetchDetails) {
        try {
          const d = await (await http(api + p)).json();
          const info = d.jobPostingInfo || {};
          job.description = info.jobDescription || '';
          job.employmentType = info.timeType || '';
          job.location = [info.location, ...(info.additionalLocations || [])].filter(Boolean).join('; ') || job.location;
          if (info.startDate) job.datePosted = isoDate(info.startDate);
          if (info.externalUrl) job.url = info.externalUrl;
          await sleep(SET.requestDelayMs);
        } catch (e) { /* keep summary only */ }
      }
      out.push(job);
    }
    return out;
  },

  async greenhouse(src) {
    if (/BOARD_TOKEN/.test(src.board)) throw new SkipError('Greenhouse source still has placeholder values');
    const data = await (await http(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(src.board)}/jobs?content=true`)).json();
    return (data.jobs || []).map(r => ({
      postingId: 'greenhouse:' + r.id, title: r.title, company: src.company, location: r.location && r.location.name,
      url: r.absolute_url, datePosted: r.first_published || r.updated_at, description: r.content
    }));
  },

  async lever(src) {
    if (/SITE_NAME/.test(src.site)) throw new SkipError('Lever source still has placeholder values');
    const data = await (await http(`https://api.lever.co/v0/postings/${encodeURIComponent(src.site)}?mode=json`)).json();
    return (data || []).map(r => ({
      postingId: 'lever:' + r.id, title: r.text, company: src.company,
      location: [r.categories && r.categories.location].concat((r.categories && r.categories.allLocations) || []).filter(Boolean).join('; '),
      url: r.hostedUrl, datePosted: r.createdAt, employmentType: r.categories && r.categories.commitment,
      workplace: r.workplaceType, description: r.descriptionPlain || r.description
    }));
  },

  async smartrecruiters(src) {
    if (/COMPANY_ID/.test(src.companyIdentifier)) throw new SkipError('SmartRecruiters source still has placeholder values');
    const out = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const data = await (await http(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(src.companyIdentifier)}/postings?limit=100&offset=${offset}`)).json();
      for (const r of data.content || []) {
        const l = r.location || {};
        out.push({
          postingId: 'smartrecruiters:' + r.id, title: r.name, company: src.company || (r.company && r.company.name),
          location: [l.city, l.region, l.country, l.remote ? 'Remote' : ''].filter(Boolean).join(', '),
          url: `https://jobs.smartrecruiters.com/${src.companyIdentifier}/${r.id}`,
          datePosted: r.releasedDate, employmentType: r.typeOfEmployment && r.typeOfEmployment.label, description: ''
        });
      }
      if ((data.content || []).length < 100) break;
      await sleep(SET.requestDelayMs);
    }
    return out;
  },

  async rss(src) {
    if (/example\.org/.test(src.url)) throw new SkipError('RSS source still has the example URL');
    await checkRobots(src.url);
    const xml = await (await http(src.url)).text();
    const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
    const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? decode(m[1]).trim() : ''; };
    return items.map(it => {
      const link = tag(it, 'link') || ((it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '');
      return {
        postingId: 'rss:' + (tag(it, 'guid') || tag(it, 'id') || link), title: clean(tag(it, 'title')),
        company: src.company || clean(tag(it, 'author')) || '', location: tag(it, 'location') || src.defaultLocation || '',
        url: link, datePosted: tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated'),
        description: tag(it, 'description') || tag(it, 'summary') || tag(it, 'content')
      };
    });
  },

  async jsonld(src) {
    const out = [];
    for (const pageUrl of src.urls || []) {
      if (/example\.org/.test(pageUrl)) throw new SkipError('JSON-LD source still has the example URL');
      await checkRobots(pageUrl);
      const html = await (await http(pageUrl, { headers: { Accept: 'text/html' } })).text();
      const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
      const found = [];
      const walk = o => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        const t = [].concat(o['@type'] || []);
        if (t.includes('JobPosting')) found.push(o);
        ['@graph', 'itemListElement', 'item'].forEach(k => o[k] && walk(o[k]));
      };
      blocks.forEach(b => { try { walk(JSON.parse(b)); } catch { } });
      for (const j of found) {
        const locs = [].concat(j.jobLocation || []).map(l => { const a = (l && l.address) || {}; return [a.addressLocality, a.addressRegion].filter(Boolean).join(', '); });
        const bs = j.baseSalary && j.baseSalary.value;
        const unit = bs && bs.unitText;
        out.push({
          postingId: 'jsonld:' + ((j.identifier && (j.identifier.value || j.identifier)) || j.url || pageUrl), title: j.title,
          company: src.company || (j.hiringOrganization && j.hiringOrganization.name), location: locs.join('; ') || (j.jobLocationType === 'TELECOMMUTE' ? 'Remote, Ontario' : ''),
          url: j.url || pageUrl, datePosted: j.datePosted, validThrough: j.validThrough,
          salaryMin: bs && annual(+bs.minValue || +bs.value, unit), salaryMax: bs && annual(+bs.maxValue || +bs.value, unit),
          employmentType: [].concat(j.employmentType || []).join(' '), workplace: j.jobLocationType, description: j.description
        });
      }
      await sleep(SET.requestDelayMs);
    }
    return out;
  },

  async fixture(src) {
    return JSON.parse(await fs.readFile(path.join(__dirname, src.file || 'test-fixture.json'), 'utf8'));
  }
};

/* ------------------------------------------------------------ normalize */
function normalize(raw, src) {
  const url = validUrl(raw.url);
  if (!url || !raw.title) return null;                       // never invent URLs
  const description = clean(raw.description).slice(0, 6000);
  const location = clean(raw.location);
  if (!raw.salaryMin && !raw.salaryMax && raw.salaryRaw) { const ps = parseSalaryString(raw.salaryRaw); raw.salaryMin = ps.min; raw.salaryMax = ps.max; }
  const loc = M.matchLocation(location, P);
  if (!loc) return null;                                     // outside the GTA list
  const job = {
    title: clean(raw.title), company: clean(raw.company) || src.company || 'Employer not listed',
    location: clean(raw.displayLocation) || location, city: loc.name, region: loc.region,
    url, source: src.name.replace(/\s*\(.*\)\s*$/, ''), sourceId: src.id, sourceKind: src.kind, priority: src.priority ?? 5,
    postingId: raw.postingId ? String(raw.postingId) : '',
    datePosted: isoDate(raw.datePosted), validThrough: isoDate(raw.validThrough),
    salaryMin: raw.salaryMin || null, salaryMax: raw.salaryMax || null, salaryEstimated: !!raw.salaryEstimated,
    salary: salaryText(raw.salaryMin, raw.salaryMax, raw.salaryEstimated, raw.salaryRaw),
    employmentType: M.detectEmploymentType(raw.employmentType, description),
    workArrangement: M.detectArrangement(raw.workplace, location, description),
    description
  };
  if (job.datePosted && NOW - new Date(job.datePosted) > SET.maxPostingAgeDays * DAY) return null;
  if (job.validThrough && new Date(job.validThrough) < NOW) return null;
  const s = M.scoreJob(job, P);
  if (s.score < P.thresholds.possible) return null;
  job.industry = M.industryOf(job, P);
  job.skills = s.skills;
  job.matchScore = s.score;
  job.matchLevel = s.level;
  return job;
}

/* --------------------------------------------------------------- dedupe */
function dedupeKey(j) { return [M.normCompany(j.company), M.normTitle(j.title), M.norm(j.city)].join('|'); }
function dedupe(jobs) {
  const groups = new Map(), byUrl = new Map(), byPid = new Map();
  for (const j of jobs) {
    const cu = canonicalUrl(j.url);
    let key = (cu && byUrl.get(cu)) || (j.postingId && byPid.get(j.postingId)) || dedupeKey(j);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
    if (cu) byUrl.set(cu, key);
    if (j.postingId) byPid.set(j.postingId, key);
  }
  const out = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.priority - b.priority || b.description.length - a.description.length || (a.datePosted || '9').localeCompare(b.datePosted || '9'));
    const primary = { ...list[0] };
    const also = [];
    for (const o of list.slice(1)) {
      if (o.sourceId !== primary.sourceId && !also.some(a => a.source === o.source)) also.push({ source: o.source, url: o.url });
      if (!primary.salary && o.salary) Object.assign(primary, { salary: o.salary, salaryMin: o.salaryMin, salaryMax: o.salaryMax, salaryEstimated: o.salaryEstimated });
      if (!primary.datePosted && o.datePosted) primary.datePosted = o.datePosted;
    }
    primary.alsoFoundOn = also;
    primary.sourceIds = [...new Set(list.map(x => x.sourceId))];
    primary.id = crypto.createHash('sha1').update(dedupeKey(primary)).digest('hex').slice(0, 12);
    delete primary.priority;
    out.push(primary);
  }
  return out;
}

/* ----------------------------------------------------- history & expiry */
function mergeHistory(current, previous, sourceResults) {
  const ok = new Set(sourceResults.filter(s => s.status === 'ok').map(s => s.id));
  const prevById = new Map((previous || []).map(j => [j.id, j]));
  const nowIso = NOW.toISOString();
  const merged = [];
  for (const j of current) {
    const p = prevById.get(j.id);
    j.firstSeen = p ? p.firstSeen : nowIso;
    j.lastSeen = nowIso;
    j.lastChecked = nowIso;
    j.status = (NOW - new Date(j.firstSeen)) < 7 * DAY ? 'new' : 'active';
    merged.push(j);
    prevById.delete(j.id);
  }
  for (const p of prevById.values()) {
    const srcs = p.sourceIds || [p.sourceId];
    const allRanOk = srcs.every(id => ok.has(id));
    if (!allRanOk) { merged.push(p); continue; }             // a source failed: keep as-is
    p.lastChecked = nowIso;
    if (p.status === 'new' || p.status === 'active') { p.status = 'closed'; p.closedAt = nowIso; }
    const closedFor = (NOW - new Date(p.closedAt || nowIso)) / DAY;
    if (closedFor > SET.purgeAfterDays) continue;             // purge
    if (closedFor > SET.recentlyClosedDays) p.status = 'expired';
    merged.push(p);
  }
  return merged;
}
function nextRunDate() {
  // Mirrors the cron "0 10 * * 1" in .github/workflows/weekly-update.yml
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate(), 10, 0, 0));
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 1);
  return d.toISOString();
}

/* ------------------------------------------------------------------ main */
async function main() {
  const outJson = TEST ? path.join(__dirname, 'test-output.json') : path.join(ROOT, 'jobs.json');
  let previous = { meta: {}, sources: [], jobs: [] };
  try { previous = JSON.parse(await fs.readFile(path.join(ROOT, 'jobs.json'), 'utf8')); } catch { }
  const prevSrc = new Map((previous.sources || []).map(s => [s.id, s]));

  let sources = CONFIG.sources;
  if (TEST) sources = [{ id: 'fixture', name: 'Test fixture', type: 'fixture', kind: 'board', priority: 2, enabled: true }];
  if (ONLY.length) sources = sources.filter(s => ONLY.includes(s.id));

  const results = [], collected = [];
  for (const src of sources) {
    const base = { id: src.id, name: src.name, kind: src.kind, lastRun: NOW.toISOString(), lastSuccess: (prevSrc.get(src.id) || {}).lastSuccess || null };
    if (!src.enabled) { results.push({ ...base, status: 'disabled', count: 0, message: 'Turned off in updater/sources.json' }); continue; }
    const adapter = ADAPTERS[src.type];
    if (!adapter) { results.push({ ...base, status: 'failed', count: 0, message: `Unknown source type "${src.type}"` }); continue; }
    try {
      log(`→ ${src.name}`);
      const raw = await adapter(src);
      let kept = 0;
      for (const r of raw) { const j = normalize(r, src); if (j) { collected.push(j); kept++; } }
      results.push({ ...base, status: 'ok', count: kept, fetched: raw.length, message: `${raw.length} fetched, ${kept} matched the GTA and profile`, lastSuccess: NOW.toISOString() });
      log(`  ✓ ${raw.length} fetched, ${kept} kept`);
    } catch (e) {
      const skipped = e instanceof SkipError;
      results.push({ ...base, status: skipped ? 'skipped' : 'failed', count: 0, message: redact(e.message) + (skipped ? '' : ' — previous data retained') });
      log(`  ${skipped ? '–' : '⚠'} ${redact(e.message)}`);
    }
  }

  const anyOk = results.some(r => r.status === 'ok');
  const unique = dedupe(collected);
  const jobs = anyOk ? mergeHistory(unique, previous.jobs, results) : (previous.jobs || []);
  jobs.sort((a, b) => (b.matchScore - a.matchScore) || String(b.datePosted).localeCompare(String(a.datePosted)));

  const active = jobs.filter(j => j.status === 'new' || j.status === 'active');
  const data = {
    meta: {
      schemaVersion: 1,
      generator: 'updater/update.mjs — rule-based keyword matching, no AI',
      lastUpdated: anyOk ? NOW.toISOString() : (previous.meta && previous.meta.lastUpdated) || null,
      lastAttempt: NOW.toISOString(),
      nextUpdate: nextRunDate(),
      updateIntervalDays: SET.updateIntervalDays,
      schedule: SET.scheduleDescription,
      counts: {
        active: active.length, new: jobs.filter(j => j.status === 'new').length,
        high: active.filter(j => j.matchLevel === 'High').length,
        employers: new Set(active.map(j => M.normCompany(j.company))).size,
        closed: jobs.filter(j => j.status === 'closed').length, expired: jobs.filter(j => j.status === 'expired').length
      }
    },
    sources: results,
    jobs
  };

  log(`\n${unique.length} unique matching jobs this run; ${jobs.length} in database (${data.meta.counts.new} new).`);
  if (!anyOk) log('No source succeeded — previous jobs kept unchanged.');
  if (DRY) { log('Dry run: nothing written.'); return; }
  const json = JSON.stringify(data, null, 1);
  await fs.writeFile(outJson, json + '\n');
  if (!TEST) await fs.writeFile(path.join(ROOT, 'jobs.js'), '/* Generated by updater/update.mjs. Fallback for opening index.html directly from disk. */\nwindow.JOBS_DATA = ' + json + ';\n');
  log(`Wrote ${path.relative(ROOT, outJson)}${TEST ? '' : ' and jobs.js'}`);
}

main().catch(e => { console.error('Updater crashed:', redact(e.stack || e.message)); process.exit(1); });
