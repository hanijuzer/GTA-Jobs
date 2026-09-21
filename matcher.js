/* ==========================================================================
   matcher.js — deterministic, rule-based job matching. NO AI.
   Shared by the dashboard (browser) and the updater (Node), so a job always
   gets the same score in both places. Every rule is visible below.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ text */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function aliases(entry) {
    if (Array.isArray(entry)) return entry.map(norm).filter(Boolean);
    if (entry && typeof entry === 'object') return [entry.name].concat(entry.aliases || []).map(norm).filter(Boolean);
    return String(entry).split('|').map(norm).filter(Boolean);
  }
  function label(entry) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry.name;
    return String(entry).split('|')[0].trim();
  }
  var reCache = {};
  function phraseRe(p) {
    var r = reCache[p];
    if (!r) {
      var esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\-/]+');
      r = new RegExp('(?:^|[^a-z0-9])' + esc + '(?=$|[^a-z0-9])', 'i');
      reCache[p] = r;
    }
    return r;
  }
  function hasPhrase(text, p) { return !!p && phraseRe(p).test(text); }
  function matchEntry(text, entry) {
    var al = aliases(entry);
    for (var i = 0; i < al.length; i++) if (hasPhrase(text, al[i])) return al[i];
    return null;
  }
  function matchEntries(text, list) {
    var out = [];
    (list || []).forEach(function (e) { var h = matchEntry(text, e); if (h) out.push({ label: label(e), hit: h, entry: e }); });
    return out;
  }
  function firstHit(text, list) {
    for (var i = 0; i < (list || []).length; i++) {
      var h = matchEntry(text, list[i]);
      if (h) return { label: label(list[i]), hit: h, entry: list[i] };
    }
    return null;
  }
  function jobText(job) {
    return norm([job.title, job.company, job.description, (job.skills || []).join(' ')].join(' \n '));
  }

  /* -------------------------------------------------------------- location */
  function matchLocation(text, P) {
    var t = norm(text);
    if (!t) return null;
    for (var i = 0; i < P.locations.length; i++) {
      if (matchEntry(t, P.locations[i])) return { name: P.locations[i].name, region: P.locations[i].region };
    }
    if (P.includeRemoteOntario && /remote|work from home|telework|anywhere/.test(t) && /ontario|(^|[^a-z])on([^a-z]|$)|canada/.test(t)) {
      return { name: 'Remote – Ontario', region: 'Remote' };
    }
    return null;
  }

  /* --------------------------------------------------------- classification */
  function detectArrangement(hint, location, description) {
    var h = norm(hint), l = norm(location), d = norm(description);
    if (/hybrid/.test(h) || /hybrid/.test(l)) return 'Hybrid';
    if (/remote/.test(h) || /remote/.test(l)) return 'Remote';
    if (/on-?site|in office|in-office/.test(h)) return 'On-site';
    if (/\bhybrid\b|hybrid work|hybrid model/.test(d)) return 'Hybrid';
    if (/fully remote|100% remote|remote position|work from home/.test(d)) return 'Remote';
    return 'On-site';
  }
  function detectEmploymentType(hint, description) {
    var h = norm(hint), d = norm(description);
    var s = h || '';
    if (/contract|temporary|temp|fixed[- ]term|term position/.test(s)) return 'Contract';
    if (/part[- ]?time/.test(s)) return 'Part-time';
    if (/full[- ]?time|permanent|regular/.test(s)) return 'Full-time';
    if (/(\d+|twelve|six|eighteen)[- ](month|year) contract|contract position|contract role|fixed[- ]term|temporary/.test(d)) return 'Contract';
    if (/part[- ]time/.test(d) && !/full[- ]time/.test(d)) return 'Part-time';
    return 'Full-time';
  }
  function industryOf(job, P) {
    var hit = firstHit(jobText(job), P.industries);
    return hit ? hit.label : 'Construction (general)';
  }
  function titleGroup(title, P) {
    var t = norm(title);
    for (var i = 0; i < (P.titleGroups || []).length; i++) {
      var g = P.titleGroups[i];
      for (var j = 0; j < g.words.length; j++) if (t.indexOf(norm(g.words[j])) !== -1) return g.name;
    }
    return 'Other';
  }

  /* ------------------------------------------------------------ experience */
  // Finds "5+ years", "7-10 years of experience", "minimum of 8 years" etc.
  // Returns the highest minimum requirement mentioned, or null.
  function requiredYears(text) {
    var re = /(?:minimum(?: of)?|at least|over)?\s*(\d{1,2})\s*\+?\s*(?:(?:-|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:[a-z&/,\-]+\s+){0,5}?(?:experience|exp\b)/g;
    var m, best = null;
    while ((m = re.exec(text))) {
      var n = parseInt(m[1], 10);
      if (n >= 1 && n <= 30) best = best === null ? n : Math.max(best, n);
    }
    return best;
  }

  /* ---------------------------------------------------------------- scoring */
  function scoreJob(job, P) {
    var S = P.scoring, T = P.thresholds;
    var title = norm(job.title);
    var text = jobText(job);
    var breakdown = [];
    var total = 0;
    function add(label, pts, detail) {
      if (!pts) return;
      total += pts;
      breakdown.push({ label: label, points: pts, detail: detail || '' });
    }

    // 1. Title
    var titlePts = 0, titleTier = '', titleHit = firstHit(title, P.targetTitles.primary);
    if (titleHit) { titlePts = S.titlePrimary; titleTier = 'target title'; }
    else if ((titleHit = firstHit(title, P.targetTitles.related))) { titlePts = S.titleRelated; titleTier = 'related title'; }
    else if ((titleHit = firstHit(title, P.titleFamilyWords))) { titlePts = S.titleFamily; titleTier = 'title keyword'; }
    add('Title match', titlePts, titleHit ? titleHit.label + ' (' + titleTier + ')' : '');

    var excluded = firstHit(title, P.excludeTitleWords);
    if (excluded) add('Unrelated title word', -S.excludePenalty, excluded.hit);

    // 2. Skills
    var skills = matchEntries(text, P.skills);
    add('Skills', Math.min(skills.length * S.perSkill, S.skillsMax),
      skills.length + ' found' + (skills.length * S.perSkill > S.skillsMax ? ' (capped)' : ''));

    // 3. Credentials you hold
    var certs = [], certPts = 0;
    (P.certifications || []).forEach(function (c) { if (matchEntry(text, c)) { certs.push(c.name); certPts += c.points; } });
    add('Credentials', Math.min(certPts, S.certsMax), certs.join(', '));

    // 4. Industry
    var inds = matchEntries(text, P.industries);
    add('Industry', Math.min(inds.length * S.perIndustry, S.industryMax), inds.map(function (i) { return i.label; }).join(', '));

    // 5. Experience
    var yrs = requiredYears(text);
    if (yrs !== null && yrs <= P.experience.years) add('Experience', S.experienceMeets, yrs + '+ years asked; you have ' + P.experience.years);
    var signals = matchEntries(text, P.experienceSignals);
    add('Experience signals', Math.min(signals.length * S.perSignal, S.signalsMax), signals.map(function (s) { return s.label; }).join(', '));

    // 6. Employer watchlist
    var emp = firstHit(norm(job.company), P.employers);
    if (emp) add('Watchlist employer', S.employerWatchlist, emp.label);

    // Gaps (no points)
    var gaps = [];
    (P.credentialGaps || []).forEach(function (g) { if (matchEntry(text, g)) gaps.push({ name: g.name, note: g.note || '' }); });
    if (yrs !== null && yrs > P.experience.years) gaps.push({ name: yrs + '+ years of experience', note: 'Asks for more than the ' + P.experience.years + ' years in your profile.' });

    var score = Math.max(0, Math.min(100, total));
    // Unrelated title (e.g. "IT Project Manager"): a construction-heavy
    // description must not rescue it, so cap it just below Possible.
    if (excluded && score >= T.possible) {
      var cap = T.possible - 1;
      breakdown.push({ label: 'Unrelated title cap', points: cap - score, detail: 'Score capped at ' + cap + ' because the title contains "' + excluded.hit + '"' });
      score = cap;
    }
    var level = 'Low';
    if (score >= T.high && titlePts >= S.titleRelated) level = 'High';
    else if (score >= T.good) level = 'Good';
    else if (score >= T.possible) level = 'Possible';

    return {
      score: score, rawScore: total, level: level, breakdown: breakdown,
      skills: skills.map(function (s) { return s.label; }),
      credentials: certs, gaps: gaps, yearsRequired: yrs,
      titleMatch: titleHit ? titleHit.label : '', titleTier: titleTier
    };
  }

  /* ------------------------------------------------------- keyword library */
  // Broad library used to suggest keywords for a specific posting.
  var KEYWORD_LIBRARY = {
    'Project delivery': ['project management', 'construction management', 'project delivery', 'project planning', 'project execution', 'scope management', 'work breakdown structure|wbs', 'project charter', 'project lifecycle', 'stage gate', 'lessons learned', 'continuous improvement', 'milestones'],
    'Schedule & cost controls': ['scheduling|schedule|schedules', 'baseline schedule', 'look-ahead|lookahead', 'critical path|cpm', 'schedule recovery', 'progress reporting|progress reports', 'project controls', 'cost control|cost controls|cost management', 'budgeting|budget|budgets', 'forecasting|forecast', 'estimate to complete', 'estimate at completion|eac', 'earned value|evm|earned value management', 'spi', 'cpi', 'cash flow', 'variance analysis|variance reporting', 'cost reporting', 'estimating|estimate|estimates', 'quantity takeoff|takeoff|take-off', 'bill of quantities|boq', 'resource allocation|resource planning|resource loading', 'risk management|risk register', 'risk assessment|risk assessments', 'kpi|kpis|key performance indicators', 'dashboard|dashboards'],
    'Contracts & commercial': ['contract administration|contract admin', 'contract management', 'change orders|change order', 'change management', 'change notice|change notices|change directive', 'variations|variation', 'claims', 'delay analysis|delay claims', 'procurement', 'tendering|tender|tenders', 'bid|bids|bidding', 'rfp|request for proposal', 'rfi|rfis|request for information', 'submittals|submittal', 'progress billing|progress payments|payment certificates|progress claims', 'invoicing|invoices', 'subcontractor management|subcontractors|subcontract|subcontracts', 'vendor management|suppliers|vendors', 'ccdc', 'commercial management', 'negotiation|negotiate|negotiating', 'cost recovery', 'lien|holdback|prompt payment'],
    'Delivery models': ['design-build|design build', 'p3|public-private partnership|public private partnership', 'alternative financing and procurement|afp', 'epc', 'epcm', 'progressive design-build', 'alliance', 'construction management at risk|cmar', 'early contractor involvement|eci', 'integrated project delivery|ipd', 'stipulated price', 'unit price'],
    'Transit & infrastructure': ['transit', 'light rail|lrt', 'subway', 'rail|railway', 'stations|station', 'go transit|go expansion', 'metrolinx', 'ttc', 'ontario line', 'eglinton crosstown', 'third-party|third party', 'utility relocation|utilities', 'tunnel|tunnelling|tunneling', 'bridges|bridge', 'highway|highways', 'roads|roadworks', 'municipal', 'airport', 'heavy civil|civil infrastructure', 'infrastructure', 'industrial', 'substation', 'trackwork|track work', 'systems integration', 'signalling|signaling', 'nuclear|refurbishment|mcr'],
    'Quality, safety & closeout': ['quality assurance', 'quality control', 'qa/qc', 'inspections|inspection', 'testing', 'commissioning', 'handover|hand-over', 'turnover', 'closeout|close-out', 'deficiencies|deficiency|punch list', 'as-built|as built|as-builts', 'warranty', 'health and safety|health & safety', 'ohsa|occupational health and safety act', 'whmis', 'working at heights', 'personal track safety|pts', 'compliance', 'building code|ontario building code|codes and standards', 'environmental'],
    'Stakeholders & leadership': ['stakeholder management|stakeholder engagement|stakeholders', 'client relations|client management|client relationships', 'team leadership|leadership', 'multidisciplinary|multi-disciplinary|cross-functional', 'consultants', 'community relations|public consultation', 'meeting minutes', 'progress meetings', 'conflict resolution', 'communication skills|communication', 'mentoring|mentor|coaching', 'decision making|decision-making', 'problem solving|problem-solving', 'time management', 'attention to detail'],
    'Software & tools': ['ms project|microsoft project', 'primavera|p6', 'procore', 'aconex', 'sharepoint', 'power bi', 'excel', 'power query', 'microsoft office|ms office', 'autocad', 'civil 3d', 'revit', 'bim|building information modeling', 'navisworks', 'bluebeam', 'sap', 'ecosys', 'unifier', 'qfm', 'staad', 'etabs', 'cmic', 'textura', 'jd edwards|jde'],
    'Credentials & education': ['pmp|project management professional', 'p.eng|peng|professional engineer', 'eit|engineer in training|engineer-in-training', 'gold seal', 'ccm|certified construction manager', 'capm', 'prince2', 'pmi-sp', 'pmi-rmp', 'lean construction|last planner', 'six sigma', 'civil engineering', 'engineering degree|bachelor of engineering|b.eng', 'construction management diploma|diploma in construction', 'leed']
  };

  var STOP = ('a about above across after again all also am an and any are as at be because been being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours ' +
    'ability able apply applicant applicants application applications asset benefits candidate candidates career careers company competitive complete description duties employer employment ensure equivalent etc excellent experience experienced including job jobs join knowledge looking may must new offer opportunity opportunities other our plus position preferred provide qualifications related required requirements responsibilities responsible role roles skills strong successful support team teams us within work working world year years ontario canada toronto please including various time using based level well include includes key').split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  var profileTextCache = { P: null, text: '' };
  function profileText(P) {
    if (profileTextCache.P === P) return profileTextCache.text;
    var parts = [];
    [].concat(P.skills || [], P.extraResumeTerms || [], P.targetTitles.primary, P.targetTitles.related).forEach(function (e) { parts = parts.concat(aliases(e)); });
    (P.certifications || []).forEach(function (c) { parts = parts.concat(aliases(c)); });
    (P.industries || []).forEach(function (c) { parts = parts.concat(aliases(c)); });
    profileTextCache = { P: P, text: ' ' + parts.join(' | ') + ' ' };
    return profileTextCache.text;
  }

  function isGap(entry, P) {
    var al = aliases(entry);
    return (P.credentialGaps || []).some(function (g) {
      var gt = ' ' + aliases(g).join(' | ') + ' ';
      return al.some(function (a) { return hasPhrase(gt, a); });
    });
  }

  // Keyword report for one posting: which recognised terms appear, which are
  // already on your profile, which aren't, plus other repeated phrases.
  function keywordReport(job, P) {
    var text = jobText(job);
    var ptext = profileText(P);
    var groups = [], matched = [], missing = [], covered = [];
    Object.keys(KEYWORD_LIBRARY).forEach(function (g) {
      var terms = [];
      KEYWORD_LIBRARY[g].forEach(function (entry) {
        var hit = matchEntry(text, entry);
        if (!hit) return;
        var onProfile = !!matchEntry(ptext, entry) && !isGap(entry, P);
        var t = { label: label(entry), hit: hit, onProfile: onProfile };
        terms.push(t);
        covered = covered.concat(aliases(entry));
        (onProfile ? matched : missing).push(t.label);
      });
      if (terms.length) groups.push({ group: g, terms: terms });
    });

    // Repeated phrases not in the library (simple n-gram frequency).
    var words = text.replace(/[^a-z0-9&+\-\s]/g, ' ').split(/\s+/).filter(Boolean);
    var counts = {};
    function bump(k) { counts[k] = (counts[k] || 0) + 1; }
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!STOPSET[w] && w.length >= 5 && !/^\d/.test(w)) bump(w);
      var w2 = words[i + 1];
      if (w2 && !STOPSET[w] && !STOPSET[w2] && w.length > 2 && w2.length > 2 && !/^\d/.test(w) && !/^\d/.test(w2)) bump(w + ' ' + w2);
    }
    var skip = norm(job.company).split(' ');
    var repeated = Object.keys(counts)
      .filter(function (k) {
        var n = counts[k];
        if (k.indexOf(' ') === -1 ? n < 3 : n < 2) return false;
        if (skip.indexOf(k) !== -1) return false;
        for (var c = 0; c < covered.length; c++) if (covered[c].indexOf(k) !== -1 || k.indexOf(covered[c]) !== -1) return false;
        return true;
      })
      .sort(function (a, b) { return counts[b] - counts[a] || b.length - a.length; })
      .slice(0, 14)
      .map(function (k) { return { term: k, count: counts[k] }; });

    var gaps = [];
    (P.credentialGaps || []).forEach(function (g) { if (matchEntry(text, g)) gaps.push({ name: g.name, note: g.note || '' }); });

    return { groups: groups, matched: matched, missing: missing, repeated: repeated, gaps: gaps, total: matched.length + missing.length };
  }

  /* --------------------------------------------------------- dedupe helpers */
  function normCompany(s) {
    return norm(s).replace(/\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|canada|group|the)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function normTitle(s) {
    return norm(s).replace(/\bsr\b\.?/g, 'senior').replace(/\bjr\b\.?/g, 'junior').replace(/\basst\b\.?/g, 'assistant')
      .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  return {
    norm: norm, aliases: aliases, label: label, hasPhrase: hasPhrase, matchEntry: matchEntry, matchEntries: matchEntries,
    matchLocation: matchLocation, detectArrangement: detectArrangement, detectEmploymentType: detectEmploymentType,
    industryOf: industryOf, titleGroup: titleGroup, requiredYears: requiredYears, scoreJob: scoreJob,
    keywordReport: keywordReport, KEYWORD_LIBRARY: KEYWORD_LIBRARY, normCompany: normCompany, normTitle: normTitle
  };
});
