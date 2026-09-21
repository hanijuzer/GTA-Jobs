/* ==========================================================================
   profile.js — YOUR PROFILE. Edit this file freely.

   Used by BOTH the dashboard (live re-scoring in the browser) and the weekly
   updater (updater/update.mjs). Change a title or skill here, commit, and the
   dashboard re-scores instantly — no other file needs to change.

   Syntax tips
   - "a|b|c" means: a, b and c are synonyms. The first one is the display name.
   - Matching is case-insensitive and whole-word ("pm" won't match "pmo").
   - Spaces also match hyphens and slashes ("design build" = "design-build").
   - Built from resume: Assistant PM (Crosslinx / Eglinton Crosstown LRT),
     Senior PM (industrial & municipal), PMP, EIT, M.E. Civil, PTS.
   - No name, email, phone or other personal identifiers are stored here.
   ========================================================================== */
(function (root) {
  'use strict';

  var PROFILE = {
    profileLabel: 'Project manager, transit and infrastructure',

    // Years used when a posting says "X+ years of experience".
    // Resume: coordination/PM roles since 2012, engineering since 2007.
    experience: { years: 14 },

    /* ---------------------------------------------------------------------
       TARGET TITLES — matched against the job title only
       primary  -> +40 points   related -> +25 points
       --------------------------------------------------------------------- */
    targetTitles: {
      primary: [
        'project manager|manager, project|manager project',
        'assistant project manager|asst. project manager|asst project manager|associate project manager',
        'senior project manager|sr. project manager|sr project manager',
        'deputy project manager',
        'construction project manager',
        'construction manager|manager, construction',
        'assistant construction manager|associate construction manager',
        'senior project coordinator|sr. project coordinator|sr project coordinator',
        'project controls manager|manager, project controls|project controls lead',
        'contracts manager|contract manager|manager, contracts',
        'commercial manager|commercial lead',
        'infrastructure project manager',
        'transit project manager'
      ],
      related: [
        'project coordinator|construction coordinator|coordinator, projects',
        'project controls specialist|project controls analyst|project control specialist|project controls engineer|project controls officer',
        'project engineer|construction project engineer|field project engineer',
        'contract administrator|contracts administrator|contract admin|contract administration',
        'change manager|change coordinator|change management coordinator|change order coordinator|change control',
        'closeout manager|closeout coordinator|close-out coordinator|close-out manager|closeout lead',
        'completions manager|completions coordinator|handover manager|turnover manager|commissioning manager',
        'interface manager|third party coordinator|third-party coordinator|third party manager|stakeholder manager',
        'project scheduler|scheduler|project planner|planning engineer|scheduling manager',
        'cost controller|cost manager|cost engineer|cost control manager',
        'program manager|programme manager|project director',
        'owner\'s representative|owners representative|owner\'s rep',
        'site manager|project superintendent'
      ]
    },

    // Weak title signal (+10) if no target title matched.
    titleFamilyWords: [
      'project', 'construction', 'contract', 'controls', 'commercial', 'closeout|close-out',
      'scheduler', 'planner', 'estimator', 'infrastructure', 'capital'
    ],

    // Title words that mark an unrelated job (−50). Add freely.
    excludeTitleWords: [
      'software', 'it project', 'information technology', 'technical project manager', 'technology project',
      'digital', 'clinical', 'marketing', 'product manager', 'scrum', 'agile', 'salesforce', 'erp', 'sap',
      'crm', 'event|events', 'store manager', 'retail', 'restaurant', 'pharma|pharmaceutical', 'insurance',
      'banking', 'advertising', 'creative', 'ux', 'web', 'data analyst|data engineer|data scientist',
      'cloud', 'cyber|cybersecurity', 'network engineer', 'human resources|hr', 'payroll', 'film', 'media',
      'student|co-op|coop|intern|internship'
    ],

    // Groups for the "Job title" filter (first match wins).
    titleGroups: [
      { name: 'Project management',       words: ['project manager', 'manager, project', 'project director', 'program manager', 'programme manager'] },
      { name: 'Construction management',  words: ['construction manager', 'site manager', 'superintendent'] },
      { name: 'Coordination',             words: ['coordinator'] },
      { name: 'Project controls & scheduling', words: ['controls', 'scheduler', 'planner', 'planning', 'cost'] },
      { name: 'Contracts & commercial',   words: ['contract', 'commercial', 'procurement'] },
      { name: 'Change, closeout & handover', words: ['change', 'closeout', 'close-out', 'completions', 'handover', 'turnover', 'commissioning'] },
      { name: 'Engineering',              words: ['engineer'] }
    ],

    /* ---------------------------------------------------------------------
       SKILLS — +10 each, capped (see scoring.skillsMax). From resume.
       --------------------------------------------------------------------- */
    skills: [
      'project management',
      'construction management',
      'cost control|cost analysis|cost management|cost controls|cost tracking',
      'budgeting|budget management|budgets|budget',
      'estimating|cost estimating|estimates|estimate',
      'change orders|change order|change management|change control|scope changes|scope modifications',
      'contract management|contract administration|contract admin',
      'scheduling|construction schedule|baseline schedule|look-ahead|lookahead|critical path|cpm',
      'project controls|project control',
      'earned value|evm|spi|cpi|schedule variance|cost variance',
      'estimate to complete|estimate at completion|eac',
      'forecasting|forecast|forecasts',
      'risk management|risk assessment|risk assessments|risk register',
      'stakeholder management|stakeholder engagement|stakeholder coordination|stakeholders',
      'subcontractor management|subcontractors|subcontractor|trade coordination',
      'design-build|design build',
      'procurement',
      'quality assurance|quality control|qa/qc',
      'health and safety|safety legislation|ohsa',
      'as-built|as built|as-builts|record drawings',
      'handover|turnover|turnover documentation|handover documentation',
      'closeout|close-out|project closeout|deficiencies|deficiency|punch list',
      'commissioning|testing and commissioning',
      'progress reporting|progress reports|status reports|status reporting',
      'document control|shop drawings|rfi|rfis|submittals',
      'design review|design reviews|technical review|specification compliance',
      'site inspections|inspections|inspection',
      'asset management',
      'facilities management',
      'team leadership|multidisciplinary|multi-disciplinary|cross-functional',
      'continuous improvement',
      'schedule recovery|recovery schedule',
      'ms project|microsoft project',
      'primavera|p6|primavera p6',
      'power bi',
      'excel|power query',
      'sharepoint',
      'autocad|civil 3d|revit'
    ],

    /* ---------------------------------------------------------------------
       CREDENTIALS YOU HOLD — points when a posting asks for them
       --------------------------------------------------------------------- */
    certifications: [
      { name: 'PMP', points: 10, aliases: ['pmp', 'project management professional'] },
      { name: 'EIT', points: 5, aliases: ['eit', 'engineer in training', 'engineer-in-training', 'eligible for p.eng', 'eligibility for p.eng'] },
      { name: 'Engineering degree', points: 5, aliases: ['civil engineering', 'engineering degree', 'degree in engineering', 'bachelor of engineering', 'b.eng', 'bachelor\'s degree in engineering', 'degree in civil'] },
      { name: 'Master\'s degree', points: 5, aliases: ['master\'s degree', 'masters degree', 'm.eng', 'graduate degree'] },
      { name: 'Personal Track Safety (PTS)', points: 5, aliases: ['personal track safety', 'track safety', 'pts'] },
      { name: 'Class G licence', points: 2, aliases: ['class g', 'driver\'s licence', 'driver\'s license', 'drivers licence', 'drivers license'] }
    ],

    // Credentials you DON'T hold — flagged as gaps in the job detail (no points).
    credentialGaps: [
      { name: 'P.Eng', aliases: ['p.eng', 'peng', 'professional engineer'], note: 'You hold EIT (APEGS). Check whether EIT or eligibility for P.Eng is accepted.' },
      { name: 'Gold Seal', aliases: ['gold seal'], note: 'Canadian Construction Association Gold Seal certification.' },
      { name: 'CCM / CCA', aliases: ['ccm', 'certified construction manager', 'cca', 'certified construction associate'], note: '' },
      { name: 'LEED', aliases: ['leed', 'leed ap'], note: '' },
      { name: 'Security clearance', aliases: ['security clearance', 'reliability status', 'secret clearance'], note: '' },
      { name: 'French / bilingual', aliases: ['bilingual', 'french'], note: '' }
    ],

    /* ---------------------------------------------------------------------
       INDUSTRIES — +5 each, capped. First match is used as the job's industry.
       --------------------------------------------------------------------- */
    industries: [
      { name: 'Transit & rail', aliases: ['transit', 'light rail', 'lrt', 'subway', 'railway', 'rail', 'go transit', 'go expansion', 'metrolinx', 'ttc', 'ontario line', 'eglinton crosstown', 'stations'] },
      { name: 'P3 / design-build', aliases: ['p3', 'public-private partnership', 'public private partnership', 'design-build', 'design build', 'afp', 'alternative financing and procurement', 'progressive design-build', 'alliance'] },
      { name: 'Heavy civil & infrastructure', aliases: ['heavy civil', 'civil infrastructure', 'infrastructure', 'tunnel', 'tunnelling', 'tunneling'] },
      { name: 'Highways & bridges', aliases: ['highway', 'highways', 'bridge', 'bridges', 'roads', 'roadworks', 'mto'] },
      { name: 'Airport', aliases: ['airport', 'aviation', 'gtaa', 'pearson', 'airside', 'terminal'] },
      { name: 'Nuclear & MCR', aliases: ['mcr', 'major component replacement', 'refurbishment', 'nuclear', 'opg', 'bruce power', 'darlington', 'pickering nuclear'] },
      { name: 'Industrial', aliases: ['industrial', 'manufacturing', 'plant', 'process'] },
      { name: 'Municipal & utilities', aliases: ['municipal', 'water', 'wastewater', 'utilities', 'utility', 'substation', 'hydro'] },
      { name: 'Buildings', aliases: ['commercial construction', 'institutional', 'healthcare', 'hospital', 'residential', 'high-rise', 'mixed-use'] }
    ],

    // Posting phrases that echo your experience — +5 each, capped.
    experienceSignals: [
      'major projects|megaproject|mega project|multi-billion|large-scale|large scale',
      'third-party|third party',
      'metrolinx|ttc|go transit|eglinton|ontario line|scarborough subway|yonge north',
      'handover|turnover|commissioning',
      'schedule recovery|critical path',
      'station|stations'
    ],

    // Extra resume terms (count as "on your profile" in the keyword report, no points).
    extraResumeTerms: [
      'p3', 'public-private partnership', 'transit', 'lrt', 'rail', 'stations', 'metrolinx', 'ttc',
      'eglinton crosstown', 'industrial', 'municipal', 'substation', 'bridges', 'civil engineering',
      'staad', 'etabs', 'qfm', 'bill of quantities|boq', 'quantity takeoff', 'meeting minutes', 'progress meetings',
      'consultants', 'compliance', 'codes and standards', 'kpi', 'reporting', 'communication', 'leadership',
      'precast', 'structural', 'engineering change', 'defect tracking', 'resource allocation', 'milestones',
      'multidisciplinary', 'client', 'dashboards'
    ],

    /* ---------------------------------------------------------------------
       EMPLOYER WATCHLIST — +5 if the job's company matches
       --------------------------------------------------------------------- */
    employers: [
      'Aecon', 'EllisDon', 'PCL Construction|pcl', 'Bird Construction|bird', 'Kenaidan', 'Ledcor', 'Graham',
      'EBC', 'Dragados', 'Flatiron', 'Turner Construction|turner', 'Alberici', 'Amico', 'Maple Reinders',
      'Crosslinx Transit Solutions|crosslinx', 'Mosaic Transit', 'Ferrovial', 'Vinci', 'Kiewit', 'Acciona',
      'Webuild', 'Hochtief', 'Black & McDonald|black and mcdonald', 'Pomerleau', 'Buttcon', 'Eastern Construction',
      'Colliers Project Leaders|colliers', 'AtkinsRéalis|atkinsrealis|snc-lavalin|snc lavalin', 'WSP', 'AECOM',
      'Jacobs', 'Stantec', 'Arcadis', 'HDR', 'Parsons', 'Hatch', 'Metrolinx', 'Toronto Transit Commission|ttc',
      'Infrastructure Ontario', 'City of Toronto', 'Greater Toronto Airports Authority|gtaa',
      'Ontario Power Generation|opg', 'Toronto Hydro', 'Hydro One', 'Region of Peel', 'York Region',
      'Durham Region', 'Halton Region', 'City of Mississauga', 'City of Brampton', 'City of Vaughan', 'City of Markham'
    ],

    /* ---------------------------------------------------------------------
       LOCATIONS — order matters: specific places first, regions last.
       enabled:false hides a location by default (users can toggle in the UI).
       --------------------------------------------------------------------- */
    locations: [
      { name: 'Etobicoke',      region: 'Toronto', aliases: ['etobicoke', 'rexdale', 'islington'] },
      { name: 'North York',     region: 'Toronto', aliases: ['north york', 'downsview', 'willowdale', 'don mills'] },
      { name: 'Scarborough',    region: 'Toronto', aliases: ['scarborough', 'agincourt'] },
      { name: 'Toronto',        region: 'Toronto', aliases: ['toronto', 'east york', 'york, on'] },
      { name: 'Mississauga',    region: 'Peel',    aliases: ['mississauga', 'streetsville', 'port credit'] },
      { name: 'Brampton',       region: 'Peel',    aliases: ['brampton'] },
      { name: 'Caledon',        region: 'Peel',    aliases: ['caledon', 'bolton'] },
      { name: 'Milton',         region: 'Halton',  aliases: ['milton'] },
      { name: 'Oakville',       region: 'Halton',  aliases: ['oakville'] },
      { name: 'Burlington',     region: 'Halton',  aliases: ['burlington'] },
      { name: 'Halton Hills',   region: 'Halton',  aliases: ['halton hills', 'georgetown', 'acton'] },
      { name: 'Woodbridge',     region: 'York',    aliases: ['woodbridge'] },
      { name: 'Vaughan',        region: 'York',    aliases: ['vaughan', 'concord', 'maple', 'kleinburg'] },
      { name: 'Richmond Hill',  region: 'York',    aliases: ['richmond hill'] },
      { name: 'Markham',        region: 'York',    aliases: ['markham', 'unionville', 'thornhill'] },
      { name: 'Aurora & Newmarket', region: 'York', aliases: ['aurora', 'newmarket', 'king city', 'stouffville', 'whitchurch-stouffville'] },
      { name: 'Pickering',      region: 'Durham',  aliases: ['pickering'] },
      { name: 'Ajax',           region: 'Durham',  aliases: ['ajax'] },
      { name: 'Whitby',         region: 'Durham',  aliases: ['whitby'] },
      { name: 'Oshawa',         region: 'Durham',  aliases: ['oshawa'] },
      { name: 'Clarington',     region: 'Durham',  aliases: ['clarington', 'bowmanville', 'courtice'] },
      { name: 'Halton Region',  region: 'Halton',  aliases: ['halton region', 'halton'] },
      { name: 'Peel Region',    region: 'Peel',    aliases: ['peel region', 'region of peel', 'peel'] },
      { name: 'York Region',    region: 'York',    aliases: ['york region', 'regional municipality of york'] },
      { name: 'Durham Region',  region: 'Durham',  aliases: ['durham region', 'region of durham', 'durham'] },
      { name: 'GTA (general)',  region: 'GTA',     aliases: ['gta', 'greater toronto area', 'toronto region', 'greater toronto'] }
    ],
    includeRemoteOntario: true, // keeps "Remote – Ontario" jobs

    /* ---------------------------------------------------------------------
       SCORING — transparent, rule-based. Score is capped at 100.
       --------------------------------------------------------------------- */
    scoring: {
      titlePrimary: 40,
      titleRelated: 25,
      titleFamily: 10,
      perSkill: 10,       skillsMax: 50,
      certsMax: 20,
      perIndustry: 5,     industryMax: 20,
      experienceMeets: 10,
      perSignal: 5,       signalsMax: 15,
      employerWatchlist: 5,
      excludePenalty: 50
    },
    thresholds: {
      high: 75,           // HIGH MATCH (also needs a primary/related title match)
      good: 50,           // GOOD MATCH
      possible: 30        // POSSIBLE MATCH; below this the updater drops the job
    }
  };

  root.PROFILE = PROFILE;
  if (typeof module === 'object' && module.exports) module.exports = PROFILE;
})(typeof window !== 'undefined' ? window : globalThis);
