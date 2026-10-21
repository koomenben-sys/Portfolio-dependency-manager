// Realistic mock data for a Dutch insurer ("Oranje Verzekeringen", fictional). Dates are relative to today
// so ages, deadlines and stale flags always look right. Acceptance criteria A2.
// 2026-10-17 "less is more" reset (docs/design.md section 19): six teams, 16 epics in 2027 Q1 and 13 asks,
// so the three core screens read calmly: the Afstemmen list has four team pairs, the matrix is 6 x 6.
// 2026-10-21 (section 25, item K): every phase has data. 2026 Q4 (Uitvoering) carries 16 plans incl. two not
// committed and one backlog epic, 17 asks across all teams (13 committed, 2 can't, 2 discuss), three signals
// (two In gevaar, one Gaat niet halen with a note) and owners; 2026 Q3 (Afgesloten) has delivered flags and asks.
// 2026-10-21 (section 26, D88): every team asks and provides in every phase, every ask has a size (S/M/L/XL mix),
// capacity per quarter puts one team above 100% and one in 80-100% in each phase, every epic has an owner.
import { buildBaseline } from '../domain/plan';

const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

export const PERSONAS = [
  { id: 'u-admin', name: 'Anouk de Jong', title: 'Agile coach (facilitator)', role: 'admin', teamId: null, canRank: true },
  { id: 'u-dir', name: 'Ruud Visser', title: 'Director Digital', role: 'viewer', teamId: null, canRank: true },
  { id: 'u-pay', name: 'Joris Smit', title: 'Planner Payments', role: 'planner', teamId: 't-pay', canRank: false },
  { id: 'u-por', name: 'Lotte Meijer', title: 'Planner Klantportaal', role: 'planner', teamId: 't-por', canRank: false },
  { id: 'u-clm', name: 'Sanne Bakker', title: 'Planner Claims', role: 'planner', teamId: 't-clm', canRank: false },
  { id: 'u-pol', name: 'Pieter Mulder', title: 'Planner Polisadministratie', role: 'planner', teamId: 't-pol', canRank: false },
  { id: 'u-dat', name: 'Fatima El Amrani', title: 'Planner Data Platform', role: 'planner', teamId: 't-dat', canRank: false },
  { id: 'u-cld', name: 'Mark van Dijk', title: 'Planner Platform & Security', role: 'planner', teamId: 't-cld', canRank: false },
  { id: 'u-view', name: 'Guest viewer', title: 'Read only', role: 'viewer', teamId: null, canRank: false },
];

const TEAMS = [
  ['t-pay', 'Payments'], ['t-por', 'Klantportaal'], ['t-clm', 'Claims'], ['t-pol', 'Polisadministratie'],
  ['t-dat', 'Data Platform'], ['t-cld', 'Platform & Security'],
].map(([id, name]) => ({ id, name }));

// Goals and programmes (Release A, D40): three strategic goals, two programmes, one of them "Moet" with a deadline.
const THEMES = [
  ['th-cx', 'Klantcontact digitaal', 'goal', false, null],
  ['th-eff', 'Efficiënte operatie', 'goal', false, null],
  ['th-price', 'Datagedreven sturen', 'goal', false, null],
  ['th-reg', 'DORA', 'program', true, '2027-03-01'],
  ['th-cloud', 'Kernmigratie', 'program', false, null],
].map(([id, name, type, must, mustDeadline], position) => ({ id, name, type, must, mustDeadline, archived: false, position, description: '' }));

const QUARTERS = [
  { id: 'q-26-3', year: 2026, q: 3, phase: 'closed', baseline: null },
  { id: 'q-26-4', year: 2026, q: 4, phase: 'active', baseline: null },
  { id: 'q-27-1', year: 2027, q: 1, phase: 'negotiate', baseline: null, votesRevealed: false },
  { id: 'q-27-2', year: 2027, q: 2, phase: 'prep', baseline: null },
];

// Release B (D51): team: FTE ingevuld, FTE vacant, verlofweken (team total), run %. 2027 Q1 is the planning quarter:
// Platform & Security is small (4 FTE, 1 vacant) so it lands above capacity, Polisadministratie and Data Platform krap.
// 2026 Q4 (Uitvoering): Platform & Security above capacity (pentest and DORA), Data Platform krap. 2026 Q3 (Afgesloten,
// summer leave): Claims above capacity (explains the undelivered fraud model), Data Platform krap.
const CAP = { 't-pay': [6, 0, 4, 20], 't-por': [8, 0, 5, 20], 't-clm': [8, 0, 6, 20], 't-pol': [6, 0, 3, 30], 't-dat': [5, 0, 3, 20], 't-cld': [10, 0, 3, 30] };
const CAP_27_1 = { 't-pay': [6, 1, 4, 20], 't-por': [8, 0, 5, 20], 't-clm': [8, 0, 6, 20], 't-pol': [5.5, 0, 3, 30], 't-dat': [5, 0, 3, 20], 't-cld': [4, 1, 3, 30] };
const CAP_26_4 = { 't-pay': [6, 1, 4, 20], 't-por': [8, 0, 5, 20], 't-clm': [8, 0, 6, 20], 't-pol': [6, 0, 3, 30], 't-dat': [4, 0, 6, 30], 't-cld': [5, 1, 4, 30] };
const CAP_26_3 = { 't-pay': [6, 0, 10, 20], 't-por': [8, 0, 14, 20], 't-clm': [3, 1, 12, 20], 't-pol': [6, 0, 10, 30], 't-dat': [3, 0, 7, 20], 't-cld': [10, 0, 14, 30] };
const CAP_BY_Q = { 'q-27-1': CAP_27_1, 'q-26-4': CAP_26_4, 'q-26-3': CAP_26_3 };
const capacity = QUARTERS.flatMap((q) => Object.entries(CAP_BY_Q[q.id] || CAP).map(([teamId, [headcount, fteVacant, absenceWeeks, reservePct]]) => ({
  id: `c-${teamId}-${q.id}`, teamId, quarterId: q.id, headcount, fteVacant, absenceWeeks, reservePct, weeks: 13, focusFactor: 0.65,
})));

// epic: [n, team, title, theme, label, owner, regulatoryDeadlineDays|null]  (regulation name derived below)
const E = [
  [1, 't-pay', 'Instant payouts (iDEAL / Wero)', 'th-cx', 'Payments 2027', 'Joris Smit', null],
  [2, 't-pay', 'Recurring premium collection v2', 'th-eff', 'Payments 2027', 'Joris Smit', null],
  [3, 't-pay', 'PSD3 readiness assessment', 'th-reg', '', 'Joris Smit', 120],
  [4, 't-por', 'Self-service policy changes', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [5, 't-por', 'Portal accessibility (WCAG 2.2)', 'th-reg', '', 'Lotte Meijer', 200],
  [6, 't-por', 'Single sign-on with DigiD / eHerkenning', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [7, 't-clm', 'Digital claims intake (photo + AI triage)', 'th-cx', 'Digital self-service', 'Sanne Bakker', null],
  [8, 't-clm', 'Claims straight-through processing', 'th-cx', '', 'Sanne Bakker', null],
  [9, 't-clm', 'Fraud scoring model integration', 'th-price', '', 'Sanne Bakker', null],
  [10, 't-clm', 'Legacy claims screens retirement', 'th-eff', '', 'Sanne Bakker', null],
  [11, 't-pol', 'Policy admin migration to new core (wave 2)', 'th-cloud', 'Core migration', 'Pieter Mulder', null],
  [12, 't-pol', 'IFRS 17 reporting data feeds', 'th-reg', '', 'Pieter Mulder', 90],
  [13, 't-pol', 'Product catalogue single source', '', '', 'Pieter Mulder', null],
  [14, 't-dat', 'Pricing data mart', 'th-price', 'Pricing 2027', 'Fatima El Amrani', null],
  [15, 't-dat', 'Customer 360 dataset', '', '', 'Fatima El Amrani', null],
  [16, 't-dat', 'AVG retention and erasure automation', 'th-reg', '', 'Fatima El Amrani', 75],
  [17, 't-cld', 'Landing zone and network (wave 2)', 'th-cloud', 'Core migration', 'Mark van Dijk', null],
  [18, 't-cld', 'Kubernetes platform upgrade', '', '', 'Mark van Dijk', null],
  [19, 't-cld', 'DORA ICT register and resilience testing', 'th-reg', '', 'Mark van Dijk', 60],
  [20, 't-cld', 'Self-service environments for teams', 'th-cloud', '', 'Mark van Dijk', null],
  [21, 't-cld', 'DORA incident reporting to DNB', 'th-reg', '', 'Mark van Dijk', 60],
  [22, 't-cld', 'Secrets management rollout', 'th-reg', '', 'Mark van Dijk', null],
  [23, 't-cld', 'Pen-test remediation backlog', 'th-reg', '', 'Mark van Dijk', null],
  [24, 't-cld', 'Zero-trust access for admins', 'th-cloud', '', 'Mark van Dijk', null],
  [25, 't-por', 'Mobile claims flow', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [26, 't-por', 'Biometric login', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [27, 't-por', 'Push notifications for policy events', 'th-cx', '', 'Lotte Meijer', null],
  [28, 't-por', 'App store compliance updates', 'th-cx', '', 'Lotte Meijer', null],
  [29, 't-clm', 'Storm-season claims surge tooling', 'th-eff', '', 'Sanne Bakker', null],
  [30, 't-pay', 'Payment provider (PSP) migration', 'th-eff', 'Payments 2027', 'Joris Smit', null],
  [31, 't-pol', 'Year-end tax statements', 'th-eff', '', 'Pieter Mulder', null],
  [32, 't-dat', 'Regulatory reporting DNB (quarterly)', 'th-reg', '', 'Fatima El Amrani', 30],
  [33, 't-pay', 'SEPA mandate migration', 'th-eff', 'Payments 2027', 'Joris Smit', null],
  [34, 't-por', 'Portal performance (Core Web Vitals)', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [35, 't-dat', 'Data platform cost optimisation', 'th-eff', '', 'Fatima El Amrani', null],
];
const eid = (n) => `e-${String(n).padStart(2, '0')}`;
// Eigenaar (item E): product owner / project manager per epic (free text); every epic has one (section 26).
const TEAM_OWNER = { 't-pay': 'Daan Vos', 't-por': 'Eva Jansen', 't-clm': 'Tom de Vries', 't-pol': 'Nienke Bos', 't-dat': 'Fatima El Amrani', 't-cld': 'Mark van Dijk' };
const OWNER = { 3: 'Joris Smit', 11: 'Hans Peters (PM kernmigratie)', 17: 'Hans Peters (PM kernmigratie)', 12: 'Nienke Bos', 19: 'Ilse Koning (PM DORA)', 21: 'Ilse Koning (PM DORA)', 23: 'Ilse Koning (PM DORA)' };
const ownerOf = (n, teamId) => (OWNER[n] ?? TEAM_OWNER[teamId]);
const plannerOf = (teamId) => PERSONAS.find((p) => p.teamId === teamId)?.name || '';
// Value (model Eenvoudig, D43) for the 2027 Q1 epics: epic -> H/M/L.
const VALUE = { 7: 'high', 4: 'high', 21: 'high', 12: 'medium', 1: 'high', 11: 'medium', 16: 'medium', 25: 'medium', 14: 'high', 8: 'medium', 3: 'low', 17: 'medium', 2: 'low', 15: 'medium', 13: 'low', 18: 'low',
  32: 'high', 30: 'medium', 29: 'medium', 31: 'low', 23: 'medium', 20: 'low', 10: 'medium', 22: 'high', 9: 'high', 28: 'low', 33: 'medium', 34: 'medium', 35: 'low' };
const VALUE_NOTE = { 7: 'Grootste klantirritatie: schade melden duurt 4 dagen', 21: 'Toezichthouder; boete bij te laat', 3: 'Alleen verkenning dit kwartaal' };
// OnePagers (D44): template, link, or both.
const ONE_PAGER = {
  7: { problem: 'Schademelding kost klanten gemiddeld 4 dagen en 3 telefoontjes; 30% belt na 1 week opnieuw. Zonder digitale intake blijft de NPS op schade negatief.', outcome: '60% van de particuliere schades komt digitaal binnen met foto; triage binnen 1 uur; eerste reactie binnen 1 werkdag.', outOfScope: 'Zakelijke schades en letselschade blijven buiten scope. Risico: nauwkeurigheid van het triagemodel (nu 82%, doel 90%).' },
  4: { problem: 'Polisveranderingen lopen via het klantcontactcentrum; 40% van de telefoontjes gaat over adres, auto of dekking. Klanten wachten gemiddeld 2 dagen.', outcome: 'De vijf meest gevraagde wijzigingen kunnen klanten zelf doen in het portaal, direct verwerkt in de polisadministratie.', outOfScope: 'Geen nieuwe producten of premieberekening in het portaal. Risico: de polis-API van Polisadministratie concurreert met IFRS 17.' },
  11: { problem: 'Het oude kernsysteem gaat per eind 2027 uit onderhoud; elke maand uitstel vergroot de kans op een niet-ondersteunde situatie.', outcome: 'Golf 2 (autoproducten) draait in het nieuwe kernsysteem; de oude schermen voor auto zijn uit.', outOfScope: 'Woon- en reisproducten volgen in golf 3. Risico: leverancierrelease schuift; netwerkconnectiviteit nog niet toegezegd.' },
};
const ONE_PAGER_URL = { 4: 'https://intranet.oranje.example/onepagers/self-service-polis', 19: 'https://intranet.oranje.example/onepagers/dora-ict-register' };
const epics = E.map(([n, teamId, title, themeId, label, _planner, reg]) => ({
  id: eid(n), refCode: `EP-${String(n).padStart(4, '0')}`, teamId, themeId: themeId || null, title, description: '',
  ownerName: ownerOf(n, teamId), label, regulatory: reg != null, regulatoryDeadline: reg != null ? inDays(reg) : null,
  regulation: reg == null ? '' : /DORA/.test(title) ? 'DORA (DNB)' : /AVG/.test(title) ? 'AVG / GDPR (AP)' : /IFRS/.test(title) ? 'IFRS 17' : /WCAG/.test(title) ? 'WCAG 2.2 / EAA' : /PSD3/.test(title) ? 'PSD3' : /DNB/.test(title) ? 'DNB reporting' : 'Regulatory',
  externalSource: n % 3 === 0 || n === 7 || n === 17 ? 'azure_devops' : null,
  externalId: n % 3 === 0 || n === 7 || n === 17 ? String(48000 + n * 7) : null,
  externalUrl: n % 3 === 0 || n === 7 || n === 17 ? `https://dev.azure.com/oranje/Digital/_workitems/edit/${48000 + n * 7}` : null,
  value: VALUE[n] ? { level: VALUE[n] } : {}, valueNote: VALUE_NOTE[n] || '', onePager: ONE_PAGER[n] || {}, onePagerUrl: ONE_PAGER_URL[n] || null,
}));

// Plans for 2027 Q1 (the planning quarter): [epic, rank, low, high, commitment, confidence, size]. 14 ranked, 2 unranked.
// Release B (D50): a size carries the mapped range (S 1–2, M 2–4, L 4–8, XL 8–13); older records keep their numbers.
const P1 = [
  [7, 1, 18, 24, 'committed', 'medium'], [4, 2, 14, 18, 'committed', 'high'], [21, 3, 8, 11, 'committed', 'medium'],
  [12, 4, 6, 8, 'committed', 'medium'], [1, 5, 10, 14, 'committed', 'medium'], [11, 6, 16, 20, 'discuss', 'medium'],
  [16, 7, 7, 10, 'committed', 'medium'], [25, 8, 10, 14, 'discuss', 'medium'], [14, 9, 6, 9, 'committed', 'high'],
  [8, 10, 14, 18, 'discuss', 'low'], [3, 11, 4, 8, 'committed', 'high', 'L'], [17, 12, 12, 16, 'committed', 'medium'],
  [2, 13, 8, 13, 'committed', 'high', 'XL'], [15, 14, 8, 13, 'draft', 'medium', 'XL'],
  [13, null, 4, 8, 'draft', 'medium', 'L'], [18, null, 4, 8, 'draft', 'medium', 'L'],
];
const plans = P1.map(([n, rank, effortLow, effortHigh, commitment, confidence, size], i) => ({
  id: `p1-${i + 1}`, epicId: eid(n), quarterId: 'q-27-1', rank, effortLow, effortHigh, commitment, confidence, size: size || null, delivered: false,
  updatedAt: ago(1 + (i % 9)),
}));
// Plans for 2026 Q4 (active): [epic, rank, low, high, commitment, confidence, size]. Ranks 1-12 committed; 14 and 15 are
// not committed (item D: "Niet toegezegd"); epic 20 is unranked (item I: "Backlog"). Rank 13 is added after the lock below.
const P0 = [
  [7, 1, 8, 13, 'committed', 'medium', 'XL'], [21, 2, 4, 8, 'committed', 'medium', 'L'], [16, 3, 4, 8, 'committed', 'high', 'L'],
  [32, 4, 2, 4, 'committed', 'high', 'M'], [11, 5, 8, 13, 'committed', 'medium', 'XL'], [17, 6, 8, 13, 'committed', 'low', 'XL'],
  [4, 7, 8, 13, 'committed', 'high', 'XL'], [1, 8, 4, 8, 'committed', 'medium', 'L'], [30, 9, 4, 8, 'committed', 'medium', 'L'],
  [25, 10, 4, 8, 'committed', 'medium', 'L'], [29, 11, 4, 8, 'committed', 'high', 'L'], [31, 12, 2, 4, 'committed', 'high', 'M'],
  [13, 14, 4, 8, 'not_committed', 'low', 'L'], [18, 15, 4, 8, 'discuss', 'low', 'L'], [20, null, 2, 4, 'draft', 'medium', 'M'],
];
const plans0 = P0.map(([n, rank, effortLow, effortHigh, commitment, confidence, size], i) => ({
  id: `p0-${i + 1}`, epicId: eid(n), quarterId: 'q-26-4', rank, effortLow, effortHigh, commitment, confidence, size: size || null, delivered: false,
  updatedAt: ago(20 + i),
}));
// Plans for 2026 Q3 (closed): [epic, rank, low, high, delivered, size]. Every team delivered something; Claims (above
// capacity) and Data Platform (krap) each left one epic undelivered.
const P3 = [
  [10, 1, 8, 13, true, 'XL'], [32, 2, 2, 4, true, 'M'], [22, 3, 4, 8, true, 'L'], [31, 4, 2, 4, true, 'M'], [9, 5, 4, 8, false, 'L'],
  [23, 6, 4, 8, false, 'L'], [28, 7, 1, 2, true, 'S'], [33, 8, 4, 8, true, 'L'], [34, 9, 2, 4, true, 'M'], [35, 10, 8, 13, false, 'XL'],
];
const plans3 = P3.map(([n, rank, effortLow, effortHigh, delivered, size], i) => ({
  id: `p3-${i + 1}`, epicId: eid(n), quarterId: 'q-26-3', rank, effortLow, effortHigh, commitment: 'committed', confidence: 'medium', size: size || null, delivered,
  updatedAt: ago(100 + i),
}));

// Dependencies: [n, epic, provider, quarter, ask, low, high, response, reason, createdDaysAgo, size?, certainty?]
// 2027 Q1 mix: 9 committed, 4 discuss, 2 can't, 3 open. Pairs to talk about: Klantportaal-Polisadministratie,
// Polisadministratie-Platform, Claims-Polisadministratie, Payments-Platform.
const D = [
  [1, 7, 't-cld', 'q-27-1', 'Provision AI inference cluster in landing zone', 2, 4, 'accepted', '', 18, 'M'],
  [2, 7, 't-dat', 'q-27-1', 'Anonymised claims photo dataset for model training', 2, 4, 'accepted', '', 18, 'M'],
  [3, 4, 't-pol', 'q-27-1', 'Policy change API for the portal', 2, 4, 'needs_priority_call', 'Competes with IFRS 17 feeds (rank 4) for the same two engineers', 7, 'M'],
  [4, 4, 't-cld', 'q-27-1', 'Security review of self-service flows', 1, 2, 'accepted', '', 12, 'S'],
  [5, 21, 't-dat', 'q-27-1', 'Logging pipeline for incident reporting', 2, 4, 'accepted', '', 13, 'M'],
  [6, 1, 't-cld', 'q-27-1', 'Fraud rules for instant payouts', 2, 4, 'needs_priority_call', 'Security engineers are on DORA until March', 8, 'M'],
  [7, 11, 't-cld', 'q-27-1', 'Network connectivity for core migration wave 2', 8, 13, 'declined', 'No room next to DORA incident reporting (rank 3)', 14, 'XL'],
  [8, 16, 't-clm', 'q-27-1', 'Input on claims data retention rules', 1, 2, 'proposed', '', 6, 'S'],
  [9, 25, 't-pol', 'q-27-1', 'Policy data in the mobile claims flow', 2, 4, 'needs_priority_call', 'Portal API (rank 2) or mobile first?', 5, 'M'],
  [10, 14, 't-pol', 'q-27-1', 'Policy data export for pricing mart', 4, 8, 'accepted', '', 11, 'L'],
  [11, 8, 't-pol', 'q-27-1', 'Rules engine access for straight-through processing', 4, 8, 'declined', 'Core migration wave 2 (rank 6) takes all rules-engine capacity', 9, 'L'],
  [12, 12, 't-dat', 'q-27-1', 'IFRS 17 data feed', 2, 4, 'accepted', '', 10, 'M'],
  [13, 3, 't-dat', 'q-27-1', 'Transaction data sample for PSD3 analysis', 1, 2, 'proposed', '', 2, 'S', 'low'],
  // Section 26: Payments and Klantportaal are asked something too (every team in both directions).
  [14, 7, 't-pay', 'q-27-1', 'Payout API for claims settlement (phase 2)', 2, 4, 'accepted', '', 15, 'M'],
  [15, 25, 't-pay', 'q-27-1', 'In-app premium payment', 1, 2, 'proposed', '', 4, 'S'],
  [16, 12, 't-por', 'q-27-1', 'Policy documents download for IFRS statements', 1, 2, 'accepted', '', 9, 'S'],
  [17, 16, 't-por', 'q-27-1', 'Erasure request form in the portal', 2, 4, 'needs_priority_call', 'Mobile claims flow (rank 8) first?', 6, 'M'],
  [18, 1, 't-por', 'q-27-1', 'Instant payout option in the portal', 2, 4, 'accepted', '', 12, 'M'],
  [19, 11, 't-cld', 'q-26-4', 'Network segmentation review', 1, 2, 'accepted', '', 40, 'S'],
  [20, 7, 't-dat', 'q-26-4', 'Training data extract', 1, 2, 'accepted', '', 40, 'S'],
  [21, 7, 't-cld', 'q-26-4', 'Pentest of the intake API', 1, 2, 'accepted', '', 35, 'S'],
  // Section 23 (M3/M5): one ask created after 2026 Q4 was locked (lockedAt = 30 days ago) -> "na vastzetten".
  [22, 23, 't-dat', 'q-26-4', 'Log export as remediation evidence', 1, 2, 'accepted', '', 8, 'S'],
  // Section 25 (item K): the running quarter has asks across every team; answers are fixed since the lock.
  [23, 21, 't-dat', 'q-26-4', 'Logging pipeline for incident reporting (phase 1)', 2, 4, 'accepted', '', 38, 'M'],
  [24, 16, 't-clm', 'q-26-4', 'Claims data retention rules', 1, 2, 'accepted', '', 36, 'S'],
  [25, 32, 't-pol', 'q-26-4', 'Policy figures for the DNB quarterly report', 1, 2, 'accepted', '', 37, 'S'],
  [26, 4, 't-pol', 'q-26-4', 'Address change API', 2, 4, 'accepted', '', 40, 'M'],
  [27, 1, 't-cld', 'q-26-4', 'Fraud rules for instant payouts (phase 1)', 2, 4, 'accepted', '', 39, 'M'],
  [28, 1, 't-pol', 'q-26-4', 'Payout account data from policy admin', 1, 2, 'accepted', '', 34, 'S'],
  [29, 30, 't-cld', 'q-26-4', 'Firewall rules for the new PSP', 1, 2, 'accepted', '', 41, 'S'],
  [30, 30, 't-dat', 'q-26-4', 'Reconciliation data feed for the new PSP', 2, 4, 'declined', 'No capacity next to the DNB reporting', 33, 'M'],
  [31, 25, 't-pol', 'q-26-4', 'Policy lookup in the mobile claims flow', 1, 2, 'accepted', '', 36, 'S'],
  [32, 17, 't-dat', 'q-26-4', 'Network telemetry into the data platform', 1, 2, 'accepted', '', 36, 'S'],
  [33, 29, 't-dat', 'q-26-4', 'Weather feed for storm surge forecasting', 1, 2, 'accepted', '', 35, 'S'],
  [34, 18, 't-dat', 'q-26-4', 'Data platform workloads moved to the new cluster', 8, 13, 'declined', 'Not before the DNB reporting is out', 32, 'XL'],
  [35, 31, 't-dat', 'q-26-4', 'Premium totals for the year-end statements', 1, 2, 'accepted', '', 33, 'S'],
  [39, 7, 't-pay', 'q-26-4', 'Payout API for claims settlement', 2, 4, 'accepted', '', 36, 'M'],
  [40, 4, 't-pay', 'q-26-4', 'Payment method update in the portal', 1, 2, 'accepted', '', 38, 'S'],
  [41, 21, 't-por', 'q-26-4', 'Incident notice banner in the portal', 1, 2, 'accepted', '', 37, 'S'],
  [42, 29, 't-por', 'q-26-4', 'Storm claim form in the portal', 2, 4, 'accepted', '', 35, 'M'],
  [43, 11, 't-pay', 'q-26-4', 'Premium collection cut-over for migrated policies', 2, 4, 'declined', 'Not during the PSP migration', 34, 'M'],
  // 2026 Q3 (Afgesloten): the agreements of the closed quarter.
  [36, 10, 't-pol', 'q-26-3', 'Inventory of legacy claims screens still in use', 1, 2, 'accepted', '', 125, 'S'],
  [37, 9, 't-dat', 'q-26-3', 'Fraud model scoring API', 2, 4, 'accepted', '', 122, 'M'],
  [38, 22, 't-dat', 'q-26-3', 'Secrets rotation for the data pipelines', 1, 2, 'accepted', '', 120, 'S'],
  [44, 33, 't-pol', 'q-26-3', 'Mandate data from policy admin', 1, 2, 'accepted', '', 124, 'S'],
  [45, 33, 't-cld', 'q-26-3', 'Bank connectivity firewall change', 1, 2, 'accepted', '', 123, 'S'],
  [46, 34, 't-cld', 'q-26-3', 'CDN configuration for the portal', 2, 4, 'accepted', '', 121, 'M'],
  [47, 10, 't-por', 'q-26-3', 'Retire claims pages from the portal', 1, 2, 'accepted', '', 120, 'S'],
  [48, 31, 't-pay', 'q-26-3', 'Payment totals for tax statements', 1, 2, 'accepted', '', 119, 'S'],
  [49, 35, 't-cld', 'q-26-3', 'Reserved instances for the data cluster', 4, 8, 'accepted', '', 118, 'L'],
  [50, 22, 't-clm', 'q-26-3', 'Secrets rotation test on claims systems', 1, 2, 'accepted', '', 117, 'S'],
  [51, 28, 't-dat', 'q-26-3', 'Analytics events for the app', 1, 2, 'declined', 'DNB reporting first', 116, 'S'],
];
const dependencies = D.map(([n, epicN, provider, quarterId, ask, effortLow, effortHigh, response, responseReason, created, size, certainty]) => ({
  id: `d-${n}`, refCode: `DEP-${String(n).padStart(4, '0')}`, epicId: eid(epicN),
  requesterTeamId: E.find((x) => x[0] === epicN)[1], providerTeamId: provider, quarterId, ask,
  ifDeclined: '', effortLow, effortHigh, size: size || null, certainty: certainty || 'medium', response, responseReason,
  signal: 'on_track', signalNote: '', signalAt: null, confirmedAt: null,
  requesterName: plannerOf(E.find((x) => x[0] === epicN)[1]), neededBy: null,
  grantedLow: null, grantedHigh: null, deferredToQuarterId: null, createdAt: ago(created),
  respondedAt: response === 'proposed' ? null : ago(Math.max(1, created - 3)),
}));
// Release B (D55): in the running quarter Platform & Security flags one committed ask of Claims; section 25 adds
// Polisadministratie: Gaat niet halen on the DNB figures (with a line) and In gevaar on the address change API.
Object.assign(dependencies.find((d) => d.id === 'd-21'), { signal: 'at_risk', signalNote: 'Pentest schuift', signalAt: ago(2) });
Object.assign(dependencies.find((d) => d.id === 'd-25'), { signal: 'wont_make', signalNote: 'Extract geblokkeerd door kernmigratie; cijfers pas na de deadline', signalAt: ago(1) });
Object.assign(dependencies.find((d) => d.id === 'd-26'), { signal: 'at_risk', signalNote: 'Twee engineers op IFRS 17', signalAt: ago(4) });

const votes = [
  { id: 'v1', teamId: 't-pay', quarterId: 'q-27-1', vote: 4, reason: '', votedAt: ago(1) },
  { id: 'v2', teamId: 't-clm', quarterId: 'q-27-1', vote: 2, reason: 'Rules engine access declined; STP cannot start', votedAt: ago(1) },
];

const discussions = [
  { id: 'di-1', quarterId: 'q-27-1', epicId: eid(8), depId: null, reason: 'Scope: straight-through processing before or after digital intake?', ownerName: 'Sanne Bakker', timeboxMin: 15, status: 'open', outcome: '', createdAt: ago(3) },
  { id: 'di-2', quarterId: 'q-27-1', epicId: eid(11), depId: 'd-7', reason: 'Declined network ask blocks core migration wave 2', ownerName: 'Pieter Mulder', timeboxMin: 20, status: 'open', outcome: '', createdAt: ago(5) },
  { id: 'di-3', quarterId: 'q-27-1', epicId: eid(4), depId: 'd-3', reason: 'Priority call needed on DEP-0003: portal API vs IFRS 17 feeds', ownerName: 'Pieter Mulder', timeboxMin: 10, status: 'open', outcome: '', createdAt: ago(4) },
  { id: 'di-4', quarterId: 'q-27-1', epicId: eid(1), depId: 'd-6', reason: 'Priority call needed on DEP-0006: fraud rules vs DORA', ownerName: 'Mark van Dijk', timeboxMin: 10, status: 'open', outcome: '', createdAt: ago(4) },
];

const checkIns = [
  [7, 'medium', 'Triage model accuracy 82%, target 90%', 3], [21, 'high', 'Format draft agreed with DNB', 6],
  [16, 'high', 'Erasure job live for two systems', 9], [32, 'high', 'Report submitted on time', 12],
  [11, 'medium', 'Vendor release slipping', 5], [17, 'low', 'Waiting on firewall change approval', 8],
  [4, 'high', 'Beta with 500 customers', 10], [1, 'medium', 'Sandbox integration done', 15],
  [30, 'medium', 'Cutover rehearsal planned', 22], [25, 'medium', 'Waiting on test devices', 4],
].map(([n, confidence, note, d], i) => ({ id: `ci-${i + 1}`, epicId: eid(n), quarterId: 'q-26-4', confidence, note, authorName: plannerOf(E.find((x) => x[0] === n)[1]), createdAt: ago(d) }));
// Epics 29 and 31 intentionally have no check-in (stale).

// Section 23 (M5) / section 27 (D92/D93): 2026 Q4 impediments with a Melder (ownerName / reporterId), an Actiehouder
// and mixed statuses: IMP-0001 (12 days, In behandeling) and IMP-0006 (9 days, Open) are escalated at the default of
// 7 days; IMP-0002 is fresh; IMP-0005 is resolved. Risks (IMP-0003 / 0004) stay beta.
const impediments = [
  { id: 'im-1', refCode: 'IMP-0001', kind: 'impediment', title: 'Waiting on firewall change approval', epicId: eid(17), depId: null, ownerName: 'Mark van Dijk', reporterId: 'u-cld', actionOwnerId: 'u-admin', actionOwnerName: 'Anouk de Jong', status: 'in_progress', roam: null, raisedAt: ago(12), resolvedAt: null },
  { id: 'im-2', refCode: 'IMP-0002', kind: 'impediment', title: 'No access to claims archive for model training', epicId: eid(7), depId: null, ownerName: 'Sanne Bakker', reporterId: 'u-clm', actionOwnerId: 'u-dat', actionOwnerName: 'Fatima El Amrani', status: 'open', roam: null, raisedAt: ago(3), resolvedAt: null },
  { id: 'im-3', refCode: 'IMP-0003', kind: 'risk', title: 'Core vendor release slips to February', epicId: eid(11), depId: null, ownerName: 'Pieter Mulder', reporterId: 'u-pol', actionOwnerId: null, actionOwnerName: '', status: 'open', roam: 'owned', raisedAt: ago(20), resolvedAt: null },
  { id: 'im-4', refCode: 'IMP-0004', kind: 'risk', title: 'DNB reporting format not final', epicId: eid(21), depId: null, ownerName: 'Mark van Dijk', reporterId: 'u-cld', actionOwnerId: null, actionOwnerName: '', status: 'open', roam: 'accepted', raisedAt: ago(9), resolvedAt: null },
  { id: 'im-5', refCode: 'IMP-0005', kind: 'impediment', title: 'Test devices not available', epicId: eid(25), depId: null, ownerName: 'Lotte Meijer', reporterId: 'u-por', actionOwnerId: 'u-por', actionOwnerName: 'Lotte Meijer', status: 'resolved', roam: null, raisedAt: ago(14), resolvedAt: ago(5) },
  { id: 'im-6', refCode: 'IMP-0006', kind: 'impediment', title: 'PSP sandbox certificate expired, no renewal date', epicId: eid(30), depId: null, ownerName: 'Joris Smit', reporterId: 'u-pay', actionOwnerId: null, actionOwnerName: 'Leverancier PSP', status: 'open', roam: null, raisedAt: ago(9), resolvedAt: null },
];

const events = [
  { id: 'ev-1', at: ago(6), actorId: 'u-dir', actorName: 'Ruud Visser', action: 'rank_changed', entity: 'plans', entityId: 'p1-3', quarterId: 'q-27-1', reason: 'DORA reporting is required by the regulator; moved up', before: { rank: 7 }, after: { rank: 3 } },
  { id: 'ev-2', at: ago(4), actorId: 'u-dir', actorName: 'Ruud Visser', action: 'rank_changed', entity: 'plans', entityId: 'p1-1', quarterId: 'q-27-1', reason: 'Strategy: digital claims is the top objective for 2027', before: { rank: 3 }, after: { rank: 1 } },
];

const state = {
  teams: TEAMS, themes: THEMES, quarters: QUARTERS, capacity, epics, plans: [...plans, ...plans0, ...plans3], dependencies,
  votes, discussions, checkIns, impediments, events,
  follows: {}, // Volgen (D67): per persona; the demo user follows nothing by default
  members: PERSONAS,
  settings: { language: 'nl', setupComplete: true, orgName: 'Oranje Verzekeringen', unitLabel: 'team', capacityUnit: 'person-weeks', fiscalYearStartMonth: 1, staleDays: 14, noResponseDays: 5, voteBlocksLock: false,
    capacityDefaults: { weeks: 13, focusFactor: 0.65, reservePct: 20 }, modules: false, valueModel: 'simple', skin: 'zakelijk',
    sizeMap: { S: [1, 2], M: [2, 4], L: [4, 8], XL: [8, 13] }, cadence: { mode: 'exception', weeks: 2 }, impedimentEscalationDays: 7 },
};
// Q3 was locked and closed: its baseline is the committed set Afsluiten measures against (D56).
state.quarters.find((q) => q.id === 'q-26-3').baseline = buildBaseline(state, 'q-26-3');
state.quarters.find((q) => q.id === 'q-26-3').lockedAt = ago(110);

// Q4 was locked earlier: store a baseline, then make two post-lock changes so the diff is not empty.
state.quarters.find((q) => q.id === 'q-26-4').baseline = buildBaseline(state, 'q-26-4');
state.quarters.find((q) => q.id === 'q-26-4').lockedAt = ago(30);
const p0 = state.plans.find((p) => p.id === 'p0-9');
p0.commitment = 'at_risk';
state.events.push({ id: 'ev-3', at: ago(7), actorId: 'u-pay', actorName: 'Joris Smit', action: 'commitment_changed', entity: 'plans', entityId: 'p0-9', quarterId: 'q-26-4', reason: 'PSP vendor delivered late', before: { commitment: 'committed' }, after: { commitment: 'at_risk' } });
state.plans.push({ id: 'p0-13', epicId: eid(23), quarterId: 'q-26-4', rank: 13, effortLow: 2, effortHigh: 4, commitment: 'committed', confidence: 'medium', size: 'M', delivered: false, updatedAt: ago(10) });
state.events.push({ id: 'ev-4', at: ago(2), actorId: 'u-cld', actorName: 'Mark van Dijk', action: 'signal_set', entity: 'dependencies', entityId: 'd-21', quarterId: 'q-26-4', reason: 'Pentest schuift', before: { signal: 'on_track' }, after: { signal: 'at_risk', note: 'Pentest schuift' } });
state.events.push({ id: 'ev-5', at: ago(4), actorId: 'u-pol', actorName: 'Pieter Mulder', action: 'signal_set', entity: 'dependencies', entityId: 'd-26', quarterId: 'q-26-4', reason: 'Twee engineers op IFRS 17', before: { signal: 'on_track' }, after: { signal: 'at_risk', note: 'Twee engineers op IFRS 17' } });
state.events.push({ id: 'ev-6', at: ago(1), actorId: 'u-pol', actorName: 'Pieter Mulder', action: 'signal_set', entity: 'dependencies', entityId: 'd-25', quarterId: 'q-26-4', reason: 'Extract geblokkeerd door kernmigratie; cijfers pas na de deadline', before: { signal: 'on_track' }, after: { signal: 'wont_make', note: 'Extract geblokkeerd door kernmigratie; cijfers pas na de deadline' } });

export const seedState = () => JSON.parse(JSON.stringify(state));
