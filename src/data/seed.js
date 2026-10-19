// Realistic mock data for a Dutch insurer ("Oranje Verzekeringen", fictional). Dates are relative to today
// so ages, deadlines and stale flags always look right. Acceptance criteria A2.
// 2026-10-17 "less is more" reset (docs/design.md section 19): six teams, 16 epics in 2027 Q1 and 13 asks,
// so the three core screens read calmly: the Afstemmen list has four team pairs, the matrix is 6 x 6.
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
const CAP = { 't-pay': [6, 0, 4, 20], 't-por': [8, 0, 5, 20], 't-clm': [8, 0, 6, 20], 't-pol': [6, 0, 3, 30], 't-dat': [5, 0, 3, 20], 't-cld': [10, 0, 3, 30] };
const CAP_27_1 = { 't-pay': [6, 1, 4, 20], 't-por': [8, 0, 5, 20], 't-clm': [8, 0, 6, 20], 't-pol': [5.5, 0, 3, 30], 't-dat': [5, 0, 3, 20], 't-cld': [4, 1, 3, 30] };
const capacity = QUARTERS.flatMap((q) => Object.entries(q.id === 'q-27-1' ? CAP_27_1 : CAP).map(([teamId, [headcount, fteVacant, absenceWeeks, reservePct]]) => ({
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
  [20, 't-cld', 'Self-service environments for teams', '', '', 'Mark van Dijk', null],
  [21, 't-cld', 'DORA incident reporting to DNB', 'th-reg', '', 'Mark van Dijk', 60],
  [22, 't-cld', 'Secrets management rollout', '', '', 'Mark van Dijk', null],
  [23, 't-cld', 'Pen-test remediation backlog', '', '', 'Mark van Dijk', null],
  [24, 't-cld', 'Zero-trust access for admins', 'th-cloud', '', 'Mark van Dijk', null],
  [25, 't-por', 'Mobile claims flow', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [26, 't-por', 'Biometric login', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [27, 't-por', 'Push notifications for policy events', '', '', 'Lotte Meijer', null],
  [28, 't-por', 'App store compliance updates', '', '', 'Lotte Meijer', null],
  [29, 't-clm', 'Storm-season claims surge tooling', 'th-eff', '', 'Sanne Bakker', null],
  [30, 't-pay', 'Payment provider (PSP) migration', 'th-eff', 'Payments 2027', 'Joris Smit', null],
  [31, 't-pol', 'Year-end tax statements', 'th-eff', '', 'Pieter Mulder', null],
  [32, 't-dat', 'Regulatory reporting DNB (quarterly)', 'th-reg', '', 'Fatima El Amrani', 30],
];
const eid = (n) => `e-${String(n).padStart(2, '0')}`;
// Value (model Eenvoudig, D43) for the 2027 Q1 epics: epic -> H/M/L.
const VALUE = { 7: 'high', 4: 'high', 21: 'high', 12: 'medium', 1: 'high', 11: 'medium', 16: 'medium', 25: 'medium', 14: 'high', 8: 'medium', 3: 'low', 17: 'medium', 2: 'low', 15: 'medium', 13: 'low', 18: 'low' };
const VALUE_NOTE = { 7: 'Grootste klantirritatie: schade melden duurt 4 dagen', 21: 'Toezichthouder; boete bij te laat', 3: 'Alleen verkenning dit kwartaal' };
// OnePagers (D44): template, link, or both.
const ONE_PAGER = {
  7: { problem: 'Schademelding kost klanten gemiddeld 4 dagen en 3 telefoontjes; 30% belt na 1 week opnieuw. Zonder digitale intake blijft de NPS op schade negatief.', outcome: '60% van de particuliere schades komt digitaal binnen met foto; triage binnen 1 uur; eerste reactie binnen 1 werkdag.', outOfScope: 'Zakelijke schades en letselschade blijven buiten scope. Risico: nauwkeurigheid van het triagemodel (nu 82%, doel 90%).' },
  4: { problem: 'Polisveranderingen lopen via het klantcontactcentrum; 40% van de telefoontjes gaat over adres, auto of dekking. Klanten wachten gemiddeld 2 dagen.', outcome: 'De vijf meest gevraagde wijzigingen kunnen klanten zelf doen in het portaal, direct verwerkt in de polisadministratie.', outOfScope: 'Geen nieuwe producten of premieberekening in het portaal. Risico: de polis-API van Polisadministratie concurreert met IFRS 17.' },
  11: { problem: 'Het oude kernsysteem gaat per eind 2027 uit onderhoud; elke maand uitstel vergroot de kans op een niet-ondersteunde situatie.', outcome: 'Golf 2 (autoproducten) draait in het nieuwe kernsysteem; de oude schermen voor auto zijn uit.', outOfScope: 'Woon- en reisproducten volgen in golf 3. Risico: leverancierrelease schuift; netwerkconnectiviteit nog niet toegezegd.' },
};
const ONE_PAGER_URL = { 4: 'https://intranet.oranje.example/onepagers/self-service-polis', 19: 'https://intranet.oranje.example/onepagers/dora-ict-register' };
const epics = E.map(([n, teamId, title, themeId, label, ownerName, reg]) => ({
  id: eid(n), refCode: `EP-${String(n).padStart(4, '0')}`, teamId, themeId: themeId || null, title, description: '',
  ownerName, label, regulatory: reg != null, regulatoryDeadline: reg != null ? inDays(reg) : null,
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
// Plans for 2026 Q4 (active): [epic, rank, low, high, commitment, confidence]
const P0 = [
  [7, 1, 8, 10, 'committed', 'medium'], [21, 2, 5, 7, 'committed', 'medium'], [16, 3, 4, 6, 'committed', 'high'],
  [32, 4, 3, 4, 'committed', 'high'], [11, 5, 12, 14, 'committed', 'medium'], [17, 6, 10, 12, 'committed', 'low'],
  [4, 7, 8, 10, 'committed', 'high'], [1, 8, 6, 8, 'committed', 'medium'], [30, 9, 6, 8, 'committed', 'medium'],
  [25, 10, 6, 8, 'committed', 'medium'], [29, 11, 5, 6, 'committed', 'high'], [31, 12, 3, 4, 'committed', 'high'],
];
const plans0 = P0.map(([n, rank, effortLow, effortHigh, commitment, confidence], i) => ({
  id: `p0-${i + 1}`, epicId: eid(n), quarterId: 'q-26-4', rank, effortLow, effortHigh, commitment, confidence, size: null, delivered: false,
  updatedAt: ago(20 + i),
}));
// Plans for 2026 Q3 (closed): [epic, rank, low, high, delivered]. Release B (D56): Afsluiten shows Voorspelbaarheid per team.
const P3 = [
  [10, 1, 6, 8, true], [32, 2, 3, 4, true], [22, 3, 4, 6, true], [31, 4, 3, 4, true], [9, 5, 6, 8, false], [23, 6, 4, 6, false], [28, 7, 2, 3, true],
];
const plans3 = P3.map(([n, rank, effortLow, effortHigh, delivered], i) => ({
  id: `p3-${i + 1}`, epicId: eid(n), quarterId: 'q-26-3', rank, effortLow, effortHigh, commitment: 'committed', confidence: 'medium', size: null, delivered,
  updatedAt: ago(100 + i),
}));

// Dependencies: [n, epic, provider, quarter, ask, low, high, response, reason, createdDaysAgo, size?, certainty?]
// 2027 Q1 mix: 6 committed, 3 discuss, 2 can't, 2 open. Pairs to talk about: Klantportaal-Polisadministratie,
// Polisadministratie-Platform, Claims-Polisadministratie, Payments-Platform.
const D = [
  [1, 7, 't-cld', 'q-27-1', 'Provision AI inference cluster in landing zone', 2, 4, 'accepted', '', 18, 'M'],
  [2, 7, 't-dat', 'q-27-1', 'Anonymised claims photo dataset for model training', 2, 4, 'accepted', '', 18, 'M'],
  [3, 4, 't-pol', 'q-27-1', 'Policy change API for the portal', 3, 4, 'needs_priority_call', 'Competes with IFRS 17 feeds (rank 4) for the same two engineers', 7],
  [4, 4, 't-cld', 'q-27-1', 'Security review of self-service flows', 1, 2, 'accepted', '', 12],
  [5, 21, 't-dat', 'q-27-1', 'Logging pipeline for incident reporting', 2, 4, 'accepted', '', 13, 'M'],
  [6, 1, 't-cld', 'q-27-1', 'Fraud rules for instant payouts', 2, 3, 'needs_priority_call', 'Security engineers are on DORA until March', 8],
  [7, 11, 't-cld', 'q-27-1', 'Network connectivity for core migration wave 2', 4, 8, 'declined', 'No room next to DORA incident reporting (rank 3)', 14, 'L'],
  [8, 16, 't-clm', 'q-27-1', 'Input on claims data retention rules', 1, 2, 'proposed', '', 6],
  [9, 25, 't-pol', 'q-27-1', 'Policy data in the mobile claims flow', 2, 3, 'needs_priority_call', 'Portal API (rank 2) or mobile first?', 5],
  [10, 14, 't-pol', 'q-27-1', 'Policy data export for pricing mart', 4, 8, 'accepted', '', 11, 'L'],
  [11, 8, 't-pol', 'q-27-1', 'Rules engine access for straight-through processing', 4, 8, 'declined', 'Core migration wave 2 (rank 6) takes all rules-engine capacity', 9, 'L'],
  [12, 12, 't-dat', 'q-27-1', 'IFRS 17 data feed', 3, 4, 'accepted', '', 10],
  [13, 3, 't-dat', 'q-27-1', 'Transaction data sample for PSD3 analysis', 1, 2, 'proposed', '', 2, 'S', 'low'],
  [19, 11, 't-cld', 'q-26-4', 'Network segmentation review', 1, 2, 'accepted', '', 40],
  [20, 7, 't-dat', 'q-26-4', 'Training data extract', 2, 2, 'accepted', '', 40],
  [21, 7, 't-cld', 'q-26-4', 'Pentest of the intake API', 1, 2, 'accepted', '', 35, 'S'],
];
const dependencies = D.map(([n, epicN, provider, quarterId, ask, effortLow, effortHigh, response, responseReason, created, size, certainty]) => ({
  id: `d-${n}`, refCode: `DEP-${String(n).padStart(4, '0')}`, epicId: eid(epicN),
  requesterTeamId: E.find((x) => x[0] === epicN)[1], providerTeamId: provider, quarterId, ask,
  ifDeclined: '', effortLow, effortHigh, size: size || null, certainty: certainty || 'medium', response, responseReason,
  signal: 'on_track', signalNote: '', signalAt: null, confirmedAt: null,
  requesterName: E.find((x) => x[0] === epicN)[5], neededBy: null,
  grantedLow: null, grantedHigh: null, deferredToQuarterId: null, createdAt: ago(created),
  respondedAt: response === 'proposed' ? null : ago(Math.max(1, created - 3)),
}));
// Release B (D55): in the running quarter Platform & Security flags one committed ask of Claims.
Object.assign(dependencies.find((d) => d.id === 'd-21'), { signal: 'at_risk', signalNote: 'Pentest schuift', signalAt: ago(2) });

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
].map(([n, confidence, note, d], i) => ({ id: `ci-${i + 1}`, epicId: eid(n), quarterId: 'q-26-4', confidence, note, authorName: E.find((x) => x[0] === n)[5], createdAt: ago(d) }));
// Epics 29 and 31 intentionally have no check-in (stale).

const impediments = [
  { id: 'im-1', refCode: 'IMP-0001', kind: 'impediment', title: 'Waiting on firewall change approval', epicId: eid(17), depId: null, ownerName: 'Mark van Dijk', status: 'open', roam: null, raisedAt: ago(12), resolvedAt: null },
  { id: 'im-2', refCode: 'IMP-0002', kind: 'impediment', title: 'No access to claims archive for model training', epicId: eid(7), depId: null, ownerName: 'Sanne Bakker', status: 'open', roam: null, raisedAt: ago(3), resolvedAt: null },
  { id: 'im-3', refCode: 'IMP-0003', kind: 'risk', title: 'Core vendor release slips to February', epicId: eid(11), depId: null, ownerName: 'Pieter Mulder', status: 'open', roam: 'owned', raisedAt: ago(20), resolvedAt: null },
  { id: 'im-4', refCode: 'IMP-0004', kind: 'risk', title: 'DNB reporting format not final', epicId: eid(21), depId: null, ownerName: 'Mark van Dijk', status: 'open', roam: 'accepted', raisedAt: ago(9), resolvedAt: null },
  { id: 'im-5', refCode: 'IMP-0005', kind: 'impediment', title: 'Test devices not available', epicId: eid(25), depId: null, ownerName: 'Lotte Meijer', status: 'resolved', roam: null, raisedAt: ago(14), resolvedAt: ago(5) },
];

const events = [
  { id: 'ev-1', at: ago(6), actorId: 'u-dir', actorName: 'Ruud Visser', action: 'rank_changed', entity: 'plans', entityId: 'p1-3', quarterId: 'q-27-1', reason: 'DORA reporting is required by the regulator; moved up', before: { rank: 7 }, after: { rank: 3 } },
  { id: 'ev-2', at: ago(4), actorId: 'u-dir', actorName: 'Ruud Visser', action: 'rank_changed', entity: 'plans', entityId: 'p1-1', quarterId: 'q-27-1', reason: 'Strategy: digital claims is the top objective for 2027', before: { rank: 3 }, after: { rank: 1 } },
];

const state = {
  teams: TEAMS, themes: THEMES, quarters: QUARTERS, capacity, epics, plans: [...plans, ...plans0, ...plans3], dependencies,
  votes, discussions, checkIns, impediments, events,
  members: PERSONAS,
  settings: { language: 'nl', setupComplete: true, orgName: 'Oranje Verzekeringen', unitLabel: 'team', capacityUnit: 'person-weeks', fiscalYearStartMonth: 1, staleDays: 14, noResponseDays: 5, voteBlocksLock: false,
    capacityDefaults: { weeks: 13, focusFactor: 0.65, reservePct: 20 }, modules: false, valueModel: 'simple',
    sizeMap: { S: [1, 2], M: [2, 4], L: [4, 8], XL: [8, 13] }, cadence: { mode: 'exception', weeks: 2 } },
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
state.plans.push({ id: 'p0-13', epicId: eid(29), quarterId: 'q-26-4', rank: 13, effortLow: 2, effortHigh: 3, commitment: 'committed', confidence: 'medium', size: null, delivered: false, updatedAt: ago(10) });
state.events.push({ id: 'ev-4', at: ago(2), actorId: 'u-cld', actorName: 'Mark van Dijk', action: 'signal_set', entity: 'dependencies', entityId: 'd-21', quarterId: 'q-26-4', reason: 'Pentest schuift', before: { signal: 'on_track' }, after: { signal: 'at_risk', note: 'Pentest schuift' } });

export const seedState = () => JSON.parse(JSON.stringify(state));
