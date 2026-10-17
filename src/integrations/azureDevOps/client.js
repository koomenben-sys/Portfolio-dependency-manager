// Azure DevOps REST client (read-only). Credentials are ARGUMENTS, never stored (docs/design.md D21).
//
// Production path: run this inside a Supabase Edge Function with the PAT from Vault / function
// secrets. The browser must never hold an organisation PAT. For local experiments only, the UI
// can pass import.meta.env.VITE_ADO_PAT (not persisted, not committed); the default is the mock.
//
// Two calls: WIQL (ids of epics) + work items batch with relations (title, state, area, links).

const API = '7.1';

export async function fetchEpics({ organization, project, pat, workItemType = 'Epic', fetchImpl = fetch }) {
  if (!organization || !project || !pat) throw new Error('organization, project and pat are required');
  const auth = `Basic ${btoa(`:${pat}`)}`;
  const base = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit`;
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  const wiql = { query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = '${workItemType}' AND [System.State] <> 'Removed' ORDER BY [System.Id]` };
  const q = await fetchImpl(`${base}/wiql?api-version=${API}&$top=200`, { method: 'POST', headers, body: JSON.stringify(wiql) });
  if (!q.ok) throw new Error(`WIQL failed: ${q.status}`);
  const ids = (await q.json()).workItems.map((w) => w.id);
  if (!ids.length) return { value: [] };

  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const body = { ids: ids.slice(i, i + 200), $expand: 'relations', fields: ['System.Id', 'System.Title', 'System.State', 'System.AreaPath', 'System.AssignedTo', 'System.WorkItemType'] };
    const r = await fetchImpl(`${base}/workitemsbatch?api-version=${API}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Work items batch failed: ${r.status}`);
    out.push(...(await r.json()).value);
  }
  return { value: out };
}
