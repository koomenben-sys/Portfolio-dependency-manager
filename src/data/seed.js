// Realistic mock data for a Dutch insurer ("Oranje Verzekeringen", fictional). Dates are relative to today
// so ages, deadlines and stale flags always look right. Acceptance criteria A2.
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
  { id: 'u-cld', name: 'Mark van Dijk', title: 'Planner Cloud Platform', role: 'planner', teamId: 't-cld', canRank: false },
  { id: 'u-sec', name: 'Eva Kok', title: 'Planner Security', role: 'planner', teamId: 't-sec', canRank: false },
  { id: 'u-mob', name: 'Daan Peters', title: 'Planner Mobile App', role: 'planner', teamId: 't-mob', canRank: false },
  { id: 'u-view', name: 'Guest viewer', title: 'Read only', role: 'viewer', teamId: null, canRank: false },
];

const TEAMS = [
  ['t-pay', 'Payments'], ['t-por', 'Klantportaal'], ['t-clm', 'Claims'], ['t-pol', 'Polisadministratie'],
  ['t-dat', 'Data Platform'], ['t-cld', 'Cloud Platform'], ['t-sec', 'Security'], ['t-mob', 'Mobile App'],
].map(([id, name]) => ({ id, name }));

const THEMES = [
  ['th-cx', 'Customer experience'], ['th-eff', 'Operational efficiency'], ['th-reg', 'Regulatory compliance (DORA / AVG)'],
  ['th-claim', 'Digital claims'], ['th-cloud', 'Cloud migration'], ['th-price', 'Data-driven pricing'],
].map(([id, name], position) => ({ id, name, position, description: '' }));

const QUARTERS = [
  { id: 'q-26-3', year: 2026, q: 3, phase: 'closed', baseline: null },
  { id: 'q-26-4', year: 2026, q: 4, phase: 'active', baseline: null },
  { id: 'q-27-1', year: 2027, q: 1, phase: 'negotiate', baseline: null, votesRevealed: false },
  { id: 'q-27-2', year: 2027, q: 2, phase: 'prep', baseline: null },
];

// team: headcount, absence weeks, reserve %
const CAP = { 't-pay': [6, 4, 20], 't-por': [7, 5, 20], 't-clm': [8, 6, 20], 't-pol': [6, 3, 30],
  't-dat': [5, 3, 20], 't-cld': [8, 2, 30], 't-sec': [6, 2, 25], 't-mob': [6, 4, 15] };
const capacity = QUARTERS.flatMap((q) => Object.entries(CAP).map(([teamId, [headcount, absenceWeeks, reservePct]]) => ({
  id: `c-${teamId}-${q.id}`, teamId, quarterId: q.id, headcount, weeks: 13, focusFactor: 0.65, absenceWeeks, reservePct,
})));

// epic: [n, team, title, theme, label, owner, regulatoryDeadlineDays|null]  (regulation name derived below)
const E = [
  [1, 't-pay', 'Instant payouts (iDEAL / Wero)', 'th-cx', 'Payments 2027', 'Joris Smit', null],
  [2, 't-pay', 'Recurring premium collection v2', 'th-eff', 'Payments 2027', 'Joris Smit', null],
  [3, 't-pay', 'PSD3 readiness assessment', 'th-reg', '', 'Joris Smit', 120],
  [4, 't-por', 'Self-service policy changes', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [5, 't-por', 'Portal accessibility (WCAG 2.2)', 'th-reg', '', 'Lotte Meijer', 200],
  [6, 't-por', 'Single sign-on with DigiD / eHerkenning', 'th-cx', 'Digital self-service', 'Lotte Meijer', null],
  [7, 't-clm', 'Digital claims intake (photo + AI triage)', 'th-claim', 'Digital self-service', 'Sanne Bakker', null],
  [8, 't-clm', 'Claims straight-through processing', 'th-claim', '', 'Sanne Bakker', null],
  [9, 't-clm', 'Fraud scoring model integration', 'th-claim', '', 'Sanne Bakker', null],
  [10, 't-clm', 'Legacy claims screens retirement', 'th-eff', '', 'Sanne Bakker', null],
  [11, 't-pol', 'Policy admin migration to new core (wave 2)', 'th-cloud', 'Core migration', 'Pieter Mulder', null],
  [12, 't-pol', 'IFRS 17 reporting data feeds', 'th-reg', '', 'Pieter Mulder', 90],
  [13, 't-pol', 'Product catalogue single source', 'th-eff', '', 'Pieter Mulder', null],
  [14, 't-dat', 'Pricing data mart', 'th-price', 'Pricing 2027', 'Fatima El Amrani', null],
  [15, 't-dat', 'Customer 360 dataset', 'th-cx', '', 'Fatima El Amrani', null],
  [16, 't-dat', 'AVG retention and erasure automation', 'th-reg', '', 'Fatima El Amrani', 75],
  [17, 't-cld', 'Landing zone and network (wave 2)', 'th-cloud', 'Core migration', 'Mark van Dijk', null],
  [18, 't-cld', 'Kubernetes platform upgrade', 'th-eff', '', 'Mark van Dijk', null],
  [19, 't-cld', 'DORA ICT register and resilience testing', 'th-reg', '', 'Mark van Dijk', 60],
  [20, 't-cld', 'Self-service environments for teams', '', '', 'Mark van Dijk', null],
  [21, 't-sec', 'DORA incident reporting to DNB', 'th-reg', '', 'Eva Kok', 60],
  [22, 't-sec', 'Secrets management rollout', '', '', 'Eva Kok', null],
  [23, 't-sec', 'Pen-test remediation backlog', '', '', 'Eva Kok', null],
  [24, 't-sec', 'Zero-trust access for admins', 'th-cloud', '', 'Eva Kok', null],
  [25, 't-mob', 'Mobile claims flow', 'th-claim', 'Digital self-service', 'Daan Peters', null],
  [26, 't-mob', 'Biometric login', 'th-cx', 'Digital self-service', 'Daan Peters', null],
  [27, 't-mob', 'Push notifications for policy events', '', '', 'Daan Peters', null],
  [28, 't-mob', 'App store compliance updates', '', '', 'Daan Peters', null],
  [29, 't-clm', 'Storm-season claims surge tooling', 'th-claim', '', 'Sanne Bakker', null],
  [30, 't-pay', 'Payment provider (PSP) migration', 'th-eff', 'Payments 2027', 'Joris Smit', null],
  [31, 't-pol', 'Year-end tax statements', 'th-eff', '', 'Pieter Mulder', null],
  [32, 't-dat', 'Regulatory reporting DNB (quarterly)', 'th-reg', '', 'Fatima El Amrani', 30],
];
const eid = (n) => `e-${String(n).padStart(2, '0')}`;
const epics = E.map(([n, teamId, title, themeId, label, ownerName, reg]) => ({
  id: eid(n), refCode: `EP-${String(n).padStart(4, '0')}`, teamId, themeId: themeId || null, title, description: '',
  ownerName, label, regulatory: reg != null, regulatoryDeadline: reg != null ? inDays(reg) : null,
  regulation: reg == null ? '' : /DORA/.test(title) ? 'DORA (DNB)' : /AVG/.test(title) ? 'AVG / GDPR (AP)' : /IFRS/.test(title) ? 'IFRS 17' : /WCAG/.test(title) ? 'WCAG 2.2 / EAA' : /PSD3/.test(title) ? 'PSD3' : /DNB/.test(title) ? 'DNB reporting' : 'Regulatory',
  externalSource: n % 3 === 0 || n === 7 || n === 17 ? 'azure_devops' : null,
  externalId: n % 3 === 0 || n === 7 || n === 17 ? String(48000 + n * 7) : null,
  externalUrl: n % 3 === 0 || n === 7 || n === 17 ? `https://dev.azure.com/oranje/Digital/_workitems/edit/${48000 + n * 7}` : null,
}));

// Plans for 2027 Q1: [epic, rank, low, high, commitment, confidence]
const P1 = [
  [7, 1, 18, 24, 'committed', 'medium'], [4, 2, 14, 18, 'committed', 'high'], [21, 3, 8, 11, 'committed', 'medium'],
  [12, 4, 6, 8, 'committed', 'medium'], [19, 5, 8, 10, 'at_risk', 'low'], [1, 6, 10, 14, 'committed', 'medium'],
  [11, 7, 16, 20, 'committed', 'medium'], [16, 8, 7, 10, 'discuss', 'medium'], [3, 9, 4, 6, 'committed', 'high'],
  [8, 10, 14, 18, 'discuss', 'low'], [25, 11, 10, 14, 'committed', 'medium'], [17, 12, 12, 16, 'committed', 'medium'],
  [5, 13, 10, 14, 'discuss', 'medium'], [14, 14, 6, 9, 'committed', 'high'], [24, 15, 5, 8, 'draft', 'low'],
  [9, 16, 6, 9, 'at_risk', 'low'], [2, 17, 8, 11, 'committed', 'high'], [15, 18, 8, 10, 'committed', 'medium'],
  [26, 19, 6, 8, 'committed', 'medium'], [13, 20, 4, 6, 'draft', 'medium'], [18, 21, 6, 8, 'committed', 'medium'],
  [6, 22, 8, 10, 'draft', 'low'], [23, 23, 6, 9, 'committed', 'medium'], [20, null, 5, 8, 'draft', 'medium'],
  [22, null, 5, 7, 'draft', 'medium'], [27, null, 4, 6, 'draft', 'medium'], [28, null, 3, 4, 'draft', 'high'],
  [10, null, 5, 7, 'not_committed', 'medium'],
];
const plans = P1.map(([n, rank, effortLow, effortHigh, commitment, confidence], i) => ({
  id: `p1-${i + 1}`, epicId: eid(n), quarterId: 'q-27-1', rank, effortLow, effortHigh, commitment, confidence,
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
  id: `p0-${i + 1}`, epicId: eid(n), quarterId: 'q-26-4', rank, effortLow, effortHigh, commitment, confidence,
  updatedAt: ago(20 + i),
}));

// Dependencies: [n, epic, provider, quarter, ask, low, high, response, reason, createdDaysAgo, deferredTo]
const D = [
  [1, 7, 't-cld', 'q-27-1', 'Provision AI inference cluster in landing zone', 3, 4, 'accepted', '', 18],
  [2, 7, 't-dat', 'q-27-1', 'Anonymised claims photo dataset for model training', 2, 3, 'partial', 'Only anonymised subset until AVG review is done', 18],
  [3, 4, 't-pol', 'q-27-1', 'Policy change API for portal', 3, 4, 'proposed', '', 7],
  [4, 4, 't-sec', 'q-27-1', 'Security review of self-service flows', 1, 2, 'accepted', '', 12],
  [5, 25, 't-clm', 'q-27-1', 'Claims intake API contract', 2, 3, 'accepted', '', 10],
  [6, 25, 't-sec', 'q-27-1', 'Mobile pen-test', 1, 2, 'needs_priority_call', 'Higher-ranked DORA work competes for the same engineers', 9],
  [7, 11, 't-cld', 'q-27-1', 'Network connectivity for core migration wave 2', 4, 6, 'declined', 'Team at 160% load; DORA register is rank 5 and regulatory', 14],
  [8, 11, 't-sec', 'q-27-1', 'Access model for the new core', 2, 3, 'deferred', 'Possible from April', 14, 'q-27-2'],
  [9, 1, 't-sec', 'q-27-1', 'Fraud rules for instant payouts', 2, 3, 'accepted', '', 8],
  [10, 1, 't-cld', 'q-27-1', 'Scale payments cluster for payout peaks', 1, 2, 'proposed', '', 2],
  [11, 14, 't-pol', 'q-27-1', 'Policy data export for pricing mart', 3, 4, 'accepted', '', 11],
  [12, 16, 't-clm', 'q-27-1', 'Input on claims data retention rules', 1, 2, 'proposed', '', 6],
  [13, 21, 't-cld', 'q-27-1', 'Logging pipeline for incident reporting', 3, 4, 'accepted', '', 13],
  [14, 19, 't-sec', 'q-27-1', 'DORA control mapping', 2, 3, 'needs_priority_call', 'Needs a priority call between DORA register and incident reporting', 6],
  [15, 8, 't-pol', 'q-27-1', 'Rules engine access for straight-through processing', 4, 5, 'proposed', '', 1],
  [16, 26, 't-por', 'q-27-1', 'Reuse SSO token service', 2, 3, 'accepted', '', 9],
  [17, 5, 't-cld', 'q-27-1', 'CDN and WAF configuration', 1, 2, 'accepted', '', 5],
  [18, 12, 't-dat', 'q-27-1', 'IFRS 17 data feed', 3, 4, 'partial', 'First feed in March, second in Q2', 10],
  [19, 17, 't-sec', 'q-26-4', 'Network segmentation review', 1, 2, 'accepted', '', 40],
  [20, 7, 't-dat', 'q-26-4', 'Training data extract', 2, 2, 'accepted', '', 40],
];
const dependencies = D.map(([n, epicN, provider, quarterId, ask, effortLow, effortHigh, response, responseReason, created, deferredTo]) => ({
  id: `d-${n}`, refCode: `DEP-${String(n).padStart(4, '0')}`, epicId: eid(epicN),
  requesterTeamId: E.find((x) => x[0] === epicN)[1], providerTeamId: provider, quarterId, ask,
  ifDeclined: n % 2 ? 'Epic slips one quarter' : '', effortLow, effortHigh, response, responseReason,
  requesterName: E.find((x) => x[0] === epicN)[5], neededBy: null,
  grantedLow: response === 'partial' ? Math.max(0, effortLow - 1) : null, grantedHigh: response === 'partial' ? Math.max(1, effortHigh - 1) : null,
  deferredToQuarterId: deferredTo || null, createdAt: ago(created),
  respondedAt: response === 'proposed' ? null : ago(Math.max(1, created - 3)),
}));

const votes = [
  { id: 'v1', teamId: 't-pay', quarterId: 'q-27-1', vote: 4, reason: '', votedAt: ago(1) },
  { id: 'v2', teamId: 't-clm', quarterId: 'q-27-1', vote: 2, reason: 'Two dependencies unanswered and capacity over 100%', votedAt: ago(1) },
  { id: 'v3', teamId: 't-sec', quarterId: 'q-27-1', vote: 2, reason: 'Load is 150% of capacity', votedAt: ago(2) },
];

const discussions = [
  { id: 'di-1', quarterId: 'q-27-1', epicId: eid(8), depId: null, reason: 'Scope: straight-through processing before or after digital intake?', ownerName: 'Sanne Bakker', timeboxMin: 15, status: 'open', outcome: '', createdAt: ago(3) },
  { id: 'di-2', quarterId: 'q-27-1', epicId: eid(11), depId: 'd-7', reason: 'Declined network ask blocks core migration wave 2', ownerName: 'Pieter Mulder', timeboxMin: 20, status: 'open', outcome: '', createdAt: ago(5) },
  { id: 'di-3', quarterId: 'q-27-1', epicId: eid(5), depId: null, reason: 'WCAG deadline vs redesign scope', ownerName: 'Lotte Meijer', timeboxMin: 10, status: 'open', outcome: '', createdAt: ago(2) },
  { id: 'di-4', quarterId: 'q-27-1', epicId: eid(25), depId: 'd-6', reason: 'Mobile pen-test needs priority call', ownerName: 'Eva Kok', timeboxMin: 10, status: 'open', outcome: '', createdAt: ago(4) },
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
  { id: 'im-4', refCode: 'IMP-0004', kind: 'risk', title: 'DNB reporting format not final', epicId: eid(21), depId: null, ownerName: 'Eva Kok', status: 'open', roam: 'accepted', raisedAt: ago(9), resolvedAt: null },
  { id: 'im-5', refCode: 'IMP-0005', kind: 'impediment', title: 'Test devices not available', epicId: eid(25), depId: null, ownerName: 'Daan Peters', status: 'resolved', roam: null, raisedAt: ago(14), resolvedAt: ago(5) },
];

const events = [
  { id: 'ev-1', at: ago(6), actorId: 'u-dir', actorName: 'Ruud Visser', action: 'rank_changed', entity: 'plans', entityId: 'p1-5', quarterId: 'q-27-1', reason: 'DORA register is required by the regulator; moved up', before: { rank: 9 }, after: { rank: 5 } },
  { id: 'ev-2', at: ago(4), actorId: 'u-dir', actorName: 'Ruud Visser', action: 'rank_changed', entity: 'plans', entityId: 'p1-1', quarterId: 'q-27-1', reason: 'Strategy: digital claims is the top objective for 2027', before: { rank: 3 }, after: { rank: 1 } },
];

const state = {
  teams: TEAMS, themes: THEMES, quarters: QUARTERS, capacity, epics, plans: [...plans, ...plans0], dependencies,
  votes, discussions, checkIns, impediments, events,
  members: PERSONAS,
  settings: { orgName: 'Oranje Verzekeringen', unitLabel: 'team', capacityUnit: 'person-weeks', fiscalYearStartMonth: 1, staleDays: 14, noResponseDays: 5, voteBlocksLock: false,
    capacityDefaults: { weeks: 13, focusFactor: 0.65, reservePct: 20 } },
};

// Q4 was locked earlier: store a baseline, then make two post-lock changes so the diff is not empty.
state.quarters.find((q) => q.id === 'q-26-4').baseline = buildBaseline(state, 'q-26-4');
const p0 = state.plans.find((p) => p.id === 'p0-9');
p0.commitment = 'at_risk';
state.events.push({ id: 'ev-3', at: ago(7), actorId: 'u-pay', actorName: 'Joris Smit', action: 'commitment_changed', entity: 'plans', entityId: 'p0-9', quarterId: 'q-26-4', reason: 'PSP vendor delivered late', before: { commitment: 'committed' }, after: { commitment: 'at_risk' } });
state.plans.push({ id: 'p0-13', epicId: eid(29), quarterId: 'q-26-4', rank: 13, effortLow: 2, effortHigh: 3, commitment: 'committed', confidence: 'medium', updatedAt: ago(10) });

export const seedState = () => JSON.parse(JSON.stringify(state));
