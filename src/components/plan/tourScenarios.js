// Three short role tours (docs/design.md section 19, D33): one sentence per step, 3-4 steps each.
// `view` is the hash route, `target` a [data-tour] element that gets a highlight ring, `ui` nudges view state
// (tab, matrix) through the `kp-tour` window event. Personas are the demo personas in src/data/seed.js.
const L = (nl, en) => ({ nl, en });

export const SCENARIOS = [
  {
    id: 'director',
    persona: 'u-dir',
    title: L('Directeur: prioriteren', 'Director: prioritise'),
    steps: [
      { view: 'prioriteren', target: 'prioritize', text: L('Eén lijst: alle epics van het kwartaal op strategische rang.', 'One list: every epic of the quarter in strategic order.') },
      { view: 'prioriteren', target: 'prioritize', text: L('Sleep een rij of gebruik de pijltjes; een reden is optioneel.', 'Drag a row or use the arrows; a reason is optional.') },
      { view: 'prioriteren', target: 'prioritize', text: L('Het streepje links: daar moet een team nog ja of nee zeggen.', 'The marker on the left: a team still has to say yes or no there.') },
      { view: 'afstemmen', target: 'pairs', text: L('Afstemmen toont welke teams daarover moeten praten, hoogste prioriteit eerst.', 'Align shows which teams need to talk about it, highest priority first.') },
    ],
  },
  {
    id: 'teamlead',
    persona: 'u-cld',
    title: L('Teamlead: aan ons gevraagd', 'Team lead: asked of us'),
    steps: [
      { view: 'afhankelijkheden', target: 'team-select', ui: { tab: 'incoming' }, text: L('Kies je team; de verzoeken staan op rang van het vragende epic.', 'Pick your team; the asks are ordered by the rank of the requesting epic.') },
      { view: 'afhankelijkheden', target: 'incoming', ui: { tab: 'incoming' }, text: L('Toezeggen, Bespreken of Kan niet: één klik, bij Kan niet één regel waarom.', 'Commit, Discuss or Can\'t: one click, and one line why for Can\'t.') },
      { view: 'afhankelijkheden', target: 'outgoing', ui: { tab: 'outgoing' }, text: L('Wij vragen: je eigen epics met hun verzoeken; + Verzoek voegt er een toe.', 'We ask: your own epics with their asks; + Ask adds one.') },
    ],
  },
  {
    id: 'facilitator',
    persona: 'u-admin',
    title: L('Facilitator: afstemmen', 'Facilitator: align'),
    steps: [
      { view: 'afstemmen', target: 'tiles', text: L('Vier tellers: Open, Toegezegd, Bespreken, Kan niet; klik om te filteren.', 'Four counts: Open, Committed, Discuss, Can\'t; click to filter.') },
      { view: 'afstemmen', target: 'pairs', text: L('Te bespreken is de agenda: teamparen op volgorde van het hoogste epic.', 'To discuss is the agenda: team pairs in order of their highest epic.') },
      { view: 'afstemmen', target: 'matrix', ui: { matrix: true }, text: L('De matrix toont wie wat van wie vraagt; klik een cel voor de details.', 'The matrix shows who asks what of whom; click a cell for the details.') },
    ],
  },
];
