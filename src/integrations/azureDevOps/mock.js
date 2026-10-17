// Mock Azure DevOps work-items batch response (shape of GET/POST _apis/wit/workitemsbatch, $expand=relations).
// Area paths map to the demo teams; two items are new, three match existing imported epics, one has an unknown area.
const wi = (id, title, state, area, owner, relations = []) => ({
  id, url: `https://dev.azure.com/oranje/_apis/wit/workItems/${id}`,
  fields: { 'System.Id': id, 'System.WorkItemType': 'Epic', 'System.Title': title, 'System.State': state, 'System.AreaPath': `Digital\\${area}`, 'System.AssignedTo': { displayName: owner } },
  relations: relations.map(([rel, target]) => ({ rel, url: `https://dev.azure.com/oranje/_apis/wit/workItems/${target}` })),
  _links: { html: { href: `https://dev.azure.com/oranje/Digital/_workitems/edit/${id}` } },
});

export const MOCK_ADO_RESPONSE = {
  count: 7,
  value: [
    // existing imported epics (ids match seed: 48000 + n*7 for n = 3, 6, 7, 9)
    wi(48021, 'PSD3 readiness assessment (scope updated)', 'Active', 'Payments', 'Joris Smit'),
    wi(48042, 'Single sign-on with DigiD / eHerkenning', 'New', 'Klantportaal', 'Lotte Meijer', [['System.LinkTypes.Dependency-Reverse', 48119]]),
    wi(48049, 'Digital claims intake (photo + AI triage)', 'Active', 'Claims', 'Sanne Bakker', [['System.LinkTypes.Dependency-Forward', 48200]]),
    // new epics
    wi(48119, 'Identity provider upgrade', 'New', 'Security', 'Eva Kok'),
    wi(48200, 'Claims document store on cloud', 'New', 'Cloud Platform', 'Mark van Dijk'),
    wi(48233, 'Customer feedback loop in app', 'New', 'Mobile App', 'Daan Peters', [['System.LinkTypes.Related', 48049]]),
    // unknown area path -> unmapped bucket
    wi(48301, 'Intermediary portal rebuild', 'New', 'Intermediair', 'Onbekend'),
  ],
};
