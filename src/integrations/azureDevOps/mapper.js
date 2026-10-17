// Azure DevOps -> ExternalEpic[] (docs/design.md D19). Pure: no fetch, no DB.
//
// ExternalEpic = { source: 'azure_devops', externalId, url, title, state, ownerName, teamHint, linkedExternalIds[] }
//
// Input is the response of the work items batch API with `$expand=relations`:
//   { value: [ { id, url, fields: { 'System.Title', 'System.State', 'System.AreaPath', 'System.AssignedTo': { displayName } }, relations: [ { rel, url } ] } ] }
// Team hint = last segment of the area path (most organisations map area paths to teams).

const DEP_RELS = new Set([
  'System.LinkTypes.Dependency-Forward',   // Successor
  'System.LinkTypes.Dependency-Reverse',   // Predecessor
  'System.LinkTypes.Related',
]);

const idFromUrl = (url) => { const m = /workItems\/(\d+)/i.exec(url || ''); return m ? m[1] : null; };

export function teamHintFromAreaPath(areaPath) {
  if (!areaPath) return '';
  const parts = String(areaPath).split('\\');
  return parts[parts.length - 1];
}

export function mapWorkItems(batchResponse, { organization = '', project = '' } = {}) {
  const items = batchResponse?.value ?? [];
  return items.map((wi) => {
    const f = wi.fields || {};
    const htmlUrl = wi._links?.html?.href
      || (organization && project ? `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_workitems/edit/${wi.id}` : wi.url);
    return {
      source: 'azure_devops',
      externalId: String(wi.id),
      url: htmlUrl,
      title: f['System.Title'] || `Work item ${wi.id}`,
      state: f['System.State'] || '',
      ownerName: f['System.AssignedTo']?.displayName || '',
      teamHint: teamHintFromAreaPath(f['System.AreaPath']),
      linkedExternalIds: (wi.relations || []).filter((r) => DEP_RELS.has(r.rel)).map((r) => idFromUrl(r.url)).filter(Boolean),
    };
  });
}

// Preview of what an import would do, given current epics and a team mapping (AC G3).
export function previewImport(externalEpics, epics, teamMapping) {
  const existing = new Map(epics.filter((e) => e.externalId).map((e) => [`${e.externalSource}:${e.externalId}`, e]));
  const created = []; const updated = []; const unmapped = [];
  for (const x of externalEpics) {
    if (!teamMapping[x.teamHint]) { unmapped.push(x); continue; }
    const cur = existing.get(`${x.source}:${x.externalId}`);
    if (cur) updated.push({ x, cur, titleChanged: cur.title !== x.title });
    else created.push(x);
  }
  return { created, updated, unmapped };
}
