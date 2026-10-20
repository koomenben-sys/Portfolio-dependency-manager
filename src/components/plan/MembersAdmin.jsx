import React, { useState } from 'react';
import { usePlan } from '../../context/PlanContext';
import { isAdmin, ROLES } from '../../data/repository';
import { useT } from '../../i18n';
import { Panel, btn, input, Field, ErrorNote, Modal } from './ui';

// People and roles (docs/design.md section 18). One compact table: members, and open invitations as rows
// with an "Invited" chip. Admins edit role / team / rank inline, invite through a small form, remove members.
// Demo mode: an invitation adds the person at once (no e-mail). Supabase mode: an invitation row (007) that
// becomes a membership when the person signs in with that address.
const ROLE_LABEL = { admin: 'Admin', planner: 'Planner', viewer: 'Viewer' };

export function MembersAdmin() {
  const { state, actor, run, dataSource } = usePlan();
  const t = useT();
  const admin = isAdmin(actor);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const members = state.members || [];
  const pending = (state.invitations || []).filter((i) => !i.acceptedAt);
  const teamName = (id) => state.teams.find((x) => x.id === id)?.name || '–';
  const act = async (method, ...args) => { const r = await run(method, ...args); setErr(r.ok ? null : r.error); setNotice(null); return r; };
  const change = (m, patch) => act('updateMember', m.id, patch);
  const sendLink = async (email) => {
    const r = await act('sendSignInLink', email);
    if (r.ok) setNotice(r.result?.demo ? t('Demo mode: no e-mail sent') : t('Sign-in link sent to {email}', { email }));
  };
  const roleLabel = (r) => t(ROLE_LABEL[r] || r);

  return (
    <Panel title={t('People and roles')} right={admin && <button className={btn.primary} onClick={() => setInviting(true)}>{t('Invite')}</button>}>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted text-left"><tr><th className="py-1">{t('Name')}</th><th>{t('Role')}</th><th>{t('Team')}</th><th>{t('Can rank')}</th>{admin && <th><span className="sr-only">{t('Actions')}</span></th>}</tr></thead>
        <tbody>
          {members.map((m) => {
            const self = m.id === actor.id;
            return (
              <tr key={m.id} className="border-t">
                <td className="py-1 pr-2">{m.name}{m.email && m.email !== m.name && <span className="text-xs text-muted"> · {m.email}</span>}</td>
                <td className="py-1 pr-2">{admin && !self ? (
                  <select aria-label={t('Role of {name}', { name: m.name })} className={`${input} !w-auto`} value={m.role}
                    onChange={(e) => change(m, { role: e.target.value, teamId: e.target.value === 'planner' ? (m.teamId || state.teams[0]?.id || null) : null })}>
                    {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>) : roleLabel(m.role)}</td>
                <td className="py-1 pr-2">{admin && m.role === 'planner' ? (
                  <select aria-label={t('Team of {name}', { name: m.name })} className={`${input} !w-auto`} value={m.teamId || ''} onChange={(e) => change(m, { teamId: e.target.value })}>
                    {state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>) : (m.role === 'planner' ? teamName(m.teamId) : '–')}</td>
                <td className="py-1 pr-2">{admin && m.role !== 'admin'
                  ? <input type="checkbox" aria-label={t('{name} can rank', { name: m.name })} checked={!!m.canRank} onChange={(e) => change(m, { canRank: e.target.checked })} />
                  : (m.canRank || m.role === 'admin' ? '✓' : '–')}</td>
                {admin && <td className="py-1 text-right">{!self && <button className={btn.danger} onClick={() => setRemoving(m)}>{t('remove')}</button>}</td>}
              </tr>
            );
          })}
          {admin && pending.map((i) => (
            <tr key={i.id} className="border-t text-ink-2">
              <td className="py-1 pr-2">{i.displayName || i.email}{i.displayName && <span className="text-xs text-muted"> · {i.email}</span>} <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">{t('Invited')}</span></td>
              <td className="py-1 pr-2">{roleLabel(i.role)}</td>
              <td className="py-1 pr-2">{i.role === 'planner' ? teamName(i.teamId) : '–'}</td>
              <td className="py-1 pr-2">{i.canRank || i.role === 'admin' ? '✓' : '–'}</td>
              <td className="py-1 text-right whitespace-nowrap">
                <button className={`${btn.ghost} mr-3`} onClick={() => sendLink(i.email)}>{t('Send link')}</button>
                <button className={btn.danger} onClick={() => act('revokeInvitation', i.id)}>{t('revoke')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorNote error={err} />
      {notice && <p role="status" className="text-xs text-emerald-800 mt-2">{notice}</p>}

      {inviting && <InviteModal onClose={() => setInviting(false)} onInvited={(inv) => { setInviting(false); setErr(null); setNotice(dataSource === 'mock' ? t('Demo mode: {name} added, no e-mail sent', { name: inv.displayName || inv.email }) : null); }} />}

      {removing && (
        <Modal title={t('Remove {name}?', { name: removing.name })} onClose={() => setRemoving(null)}>
          <div className="flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => setRemoving(null)}>{t('Cancel')}</button>
            <button className={btn.primary} onClick={async () => { await act('removeMember', removing.id); setRemoving(null); }}>{t('Remove')}</button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

function InviteModal({ onClose, onInvited }) {
  const { state, run } = usePlan();
  const t = useT();
  const [form, setForm] = useState({ email: '', displayName: '', role: 'planner', teamId: state.teams[0]?.id || '', canRank: false });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async () => {
    const inv = { ...form, teamId: form.role === 'planner' ? form.teamId : null };
    const r = await run('inviteMember', inv);
    if (r.ok) onInvited(inv); else setErr(r.error);
  };
  return (
    <Modal title={t('Invite')} onClose={onClose}>
      <div className="space-y-2">
        <Field l={t('E-mail address')}><input type="email" className={input} value={form.email} onChange={set('email')} /></Field>
        <Field l={t('Name (optional)')}><input className={input} value={form.displayName} onChange={set('displayName')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field l={t('Role')}><select className={input} value={form.role} onChange={set('role')}>{ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}</select></Field>
          {form.role === 'planner' && <Field l={t('Team')}><select className={input} value={form.teamId} onChange={set('teamId')}>{state.teams.length === 0 && <option value="">–</option>}{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
        </div>
        {form.role !== 'admin' && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.canRank} onChange={set('canRank')} /> {t('Can rank')}</label>}
      </div>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button>
        <button className={btn.primary} disabled={!form.email.trim()} onClick={submit}>{t('Invite')}</button>
      </div>
    </Modal>
  );
}
