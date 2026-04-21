import { useState, useEffect } from 'react';
import {
  Users, Plus, X, UserCircle, UserPlus, Copy, Check, Link as LinkIcon,
  Pencil, ArrowRightLeft, Trash2, Hash,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { family } from '../lib/api';
import { toast } from 'sonner';

const CHILD_COLORS = ['#FFD6BA', '#B9FBC0', '#90DBF4', '#E0C3FC', '#FBF8CC'];

export default function FamilyCard({ members, onChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', age: '', color: CHILD_COLORS[0] });

  const [info, setInfo] = useState(null);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [invites, setInvites] = useState([]);
  const [joinOpen, setJoinOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const loadInfo = async () => {
    try {
      const i = await family.info();
      setInfo(i);
      setNameDraft(i.name);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name required');
      return;
    }
    try {
      await family.addChild({
        name: form.name.trim(),
        age: form.age ? parseInt(form.age, 10) : null,
        color: form.color,
      });
      toast.success(`${form.name} added to the family!`);
      setForm({ name: '', age: '', color: CHILD_COLORS[0] });
      setOpen(false);
      onChange();
      loadInfo();
    } catch {
      toast.error('Failed to add child');
    }
  };

  const del = async (id) => {
    try {
      await family.deleteChild(id);
      toast.success('Removed');
      onChange();
      loadInfo();
    } catch {
      toast.error('Delete failed');
    }
  };

  const saveName = async () => {
    const n = nameDraft.trim();
    if (!n) return;
    try {
      await family.updateInfo({ name: n });
      toast.success('Family name updated');
      setEditingName(false);
      loadInfo();
    } catch {
      toast.error('Failed to update name');
    }
  };

  const copyCode = async () => {
    if (!info?.short_code) return;
    try {
      await navigator.clipboard.writeText(info.short_code);
      toast.success('Family ID copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="neo-card p-5 sm:p-6" data-testid="family-card">
      {/* Header with family ID + name */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5 pb-5 border-b-2 border-dashed border-gray-300">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users size={18} strokeWidth={2.5} />
            <div className="text-xs uppercase tracking-widest font-bold text-gray-500">Family</div>
          </div>
          {editingName ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                data-testid="family-name-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="neo-input px-2 py-1 font-outfit font-bold text-xl"
                autoFocus
              />
              <button data-testid="family-name-save-btn" onClick={saveName} className="neo-btn bg-[#B9FBC0] px-2 py-1"><Check size={14} /></button>
              <button data-testid="family-name-cancel-btn" onClick={() => { setEditingName(false); setNameDraft(info?.name || ''); }} className="neo-btn bg-white px-2 py-1"><X size={14} /></button>
            </div>
          ) : (
            <h2 className="font-outfit font-bold text-2xl mt-1 flex items-center gap-2" data-testid="family-name-display">
              {info?.name || 'Our crew'}
              <button
                data-testid="family-name-edit-btn"
                onClick={() => setEditingName(true)}
                className="text-gray-400 hover:text-gray-900"
                title="Edit family name"
              >
                <Pencil size={14} strokeWidth={2.5} />
              </button>
            </h2>
          )}
          {info?.short_code && (
            <button
              data-testid="family-code-btn"
              onClick={copyCode}
              className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 bg-[#FBF8CC] border-2 border-gray-900 rounded-md text-[11px] font-bold font-outfit hover:bg-[#FFD6BA] transition-colors"
              title="Click to copy family ID"
            >
              <Hash size={11} strokeWidth={3} />
              {info.short_code}
              <Copy size={10} strokeWidth={3} className="opacity-60" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            data-testid="family-invite-btn"
            onClick={() => { setInvitesOpen(true); family.listInvites().then(setInvites).catch(() => {}); }}
            className="neo-btn bg-[#E0C3FC] px-3 py-1.5 text-sm inline-flex items-center gap-1"
          >
            <UserPlus size={14} strokeWidth={3} />
            Invite partner
          </button>
          <button
            data-testid="family-join-btn"
            onClick={() => setJoinOpen(true)}
            className="neo-btn bg-white px-3 py-1.5 text-sm inline-flex items-center gap-1"
            title="Join another family by code"
          >
            <ArrowRightLeft size={14} strokeWidth={3} />
            Join
          </button>
          <button
            data-testid="add-child-btn"
            onClick={() => setOpen(true)}
            className="neo-btn bg-[#FFD6BA] px-3 py-1.5 text-sm inline-flex items-center gap-1"
          >
            <Plus size={14} strokeWidth={3} />
            Add child
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {members.parents.map((p) => (
          <div
            key={p.user_id}
            data-testid={`member-parent-${p.user_id}`}
            className="flex items-center gap-3 px-4 py-2.5 border-2 border-gray-900 rounded-full bg-[#90DBF4] shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]"
          >
            {p.picture ? (
              <img src={p.picture} alt={p.name} className="w-8 h-8 rounded-full border border-gray-900" />
            ) : (
              <UserCircle size={28} strokeWidth={2.5} />
            )}
            <div>
              <div className="font-outfit font-bold text-sm leading-none">{p.name}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-700 mt-0.5">Parent</div>
            </div>
          </div>
        ))}
        {members.children.map((c) => (
          <div
            key={c.child_id}
            data-testid={`member-child-${c.child_id}`}
            className="flex items-center gap-3 px-4 py-2.5 border-2 border-gray-900 rounded-full shadow-[2px_2px_0px_0px_rgba(31,41,55,1)] group"
            style={{ backgroundColor: c.color || '#FFD6BA' }}
          >
            <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-900 flex items-center justify-center text-sm font-bold font-outfit">
              {c.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-outfit font-bold text-sm leading-none">{c.name}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-700 mt-0.5">
                {c.age != null ? `${c.age} yrs` : 'Child'}
              </div>
            </div>
            <button
              data-testid={`remove-child-${c.child_id}`}
              onClick={() => del(c.child_id)}
              className="opacity-0 group-hover:opacity-100 ml-1 text-gray-700 hover:text-red-600 transition-opacity"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        ))}

        {members.children.length === 0 && (
          <div className="text-sm text-gray-500 italic">Add the kids to assign events and tasks to them.</div>
        )}
      </div>

      {/* Add child dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)]">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">Add a child</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3 pt-2">
            <input
              data-testid="child-name-input"
              type="text"
              placeholder="Child's name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 neo-input font-medium"
              autoFocus
            />
            <input
              data-testid="child-age-input"
              type="number"
              min="0"
              max="25"
              placeholder="Age (optional)"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              className="w-full px-3 py-2.5 neo-input"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Color</span>
              {CHILD_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  data-testid={`child-color-${c}`}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full border-2 border-gray-900 transition-transform ${form.color === c ? 'scale-125 shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button data-testid="child-save-btn" type="submit" className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold">
              Add to family
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <InviteModal
        open={invitesOpen}
        onOpenChange={(v) => { setInvitesOpen(v); if (!v) onChange(); }}
        invites={invites}
        reloadInvites={() => family.listInvites().then(setInvites)}
        familyCode={info?.short_code}
      />

      <JoinFamilyModal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={() => { onChange(); loadInfo(); }}
      />
    </div>
  );
}

function InviteModal({ open, onOpenChange, invites, reloadInvites, familyCode }) {
  const [creating, setCreating] = useState(false);
  const [lastLink, setLastLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const createInvite = async () => {
    setCreating(true);
    try {
      const invite = await family.createInvite({});
      const link = `${window.location.origin}/?invite=${invite.invite_token}`;
      setLastLink(link);
      await reloadInvites();
    } catch {
      toast.error('Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const copy = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
      if (which === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }
      toast.success('Copied!');
    } catch {
      toast.error('Copy failed');
    }
  };

  const revoke = async (token) => {
    try {
      await family.revokeInvite(token);
      await reloadInvites();
      toast.success('Revoked');
    } catch {
      toast.error('Revoke failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
            <UserPlus size={22} /> Invite your partner
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="link" className="pt-2">
          <TabsList className="grid w-full grid-cols-2 border-2 border-gray-900 bg-white p-1">
            <TabsTrigger data-testid="invite-tab-link" value="link"><LinkIcon size={14} className="mr-1.5" /> Invite link</TabsTrigger>
            <TabsTrigger data-testid="invite-tab-code" value="code"><Hash size={14} className="mr-1.5" /> Family code</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="pt-3 space-y-3">
            <p className="text-sm text-gray-600">Send this single-use link to mum or dad. They sign in with Google and automatically join your family.</p>
            <button
              data-testid="create-invite-btn"
              onClick={createInvite}
              disabled={creating}
              className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create new invite link'}
            </button>

            {lastLink && (
              <div className="p-3 bg-[#FBF8CC] border-2 border-gray-900 rounded-lg">
                <div className="text-xs uppercase tracking-widest font-bold text-gray-700 mb-1">Share this link</div>
                <div className="flex gap-2">
                  <input
                    data-testid="invite-link-output"
                    readOnly
                    value={lastLink}
                    className="flex-1 neo-input px-2 py-1.5 text-xs font-mono"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    data-testid="invite-link-copy-btn"
                    onClick={() => copy(lastLink, 'link')}
                    className="neo-btn bg-white px-3"
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            {invites.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Active invites</div>
                <ul className="space-y-2">
                  {invites.map((inv) => (
                    <li key={inv.invite_token} data-testid={`active-invite-${inv.invite_token}`} className="flex items-center gap-2 p-2 bg-white border-2 border-gray-900 rounded-lg">
                      <code className="text-xs font-mono truncate flex-1">{inv.invite_token.slice(0, 12)}…</code>
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                        exp {new Date(inv.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                      <button
                        data-testid={`revoke-invite-${inv.invite_token}`}
                        onClick={() => revoke(inv.invite_token)}
                        className="text-gray-500 hover:text-red-600"
                        title="Revoke"
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="code" className="pt-3 space-y-3">
            <p className="text-sm text-gray-600">Your partner can also join by entering this family ID in the "Join" option after signing in.</p>
            <div className="p-4 bg-[#FBF8CC] border-2 border-gray-900 rounded-lg text-center">
              <div className="text-xs uppercase tracking-widest font-bold text-gray-700 mb-1">Family ID</div>
              <div className="font-outfit font-extrabold text-3xl tracking-[0.2em]" data-testid="family-code-large">{familyCode || '…'}</div>
              <button
                data-testid="copy-family-code-btn"
                onClick={() => copy(familyCode || '', 'code')}
                className="neo-btn bg-white px-3 py-1.5 mt-3 text-sm inline-flex items-center gap-1 mx-auto"
              >
                {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                {copiedCode ? 'Copied' : 'Copy code'}
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function JoinFamilyModal({ open, onOpenChange, onJoined }) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCode(''); setPreview(null); setError('');
    }
  }, [open]);

  useEffect(() => {
    setError('');
    setPreview(null);
    const c = code.trim().toUpperCase();
    if (c.length >= 9) {
      family.previewCode(c).then(setPreview).catch((e) => {
        setError(e?.response?.data?.detail || 'Not found');
      });
    }
  }, [code]);

  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      await family.join(c);
      toast.success(`Joined ${preview?.name || 'family'}`);
      onOpenChange(false);
      onJoined();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to join');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)]">
        <DialogHeader>
          <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
            <ArrowRightLeft size={22} /> Join a family
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-gray-600">Enter your partner's family ID (e.g. <code className="font-mono font-bold">NEST-AB12</code>).</p>
          <input
            data-testid="join-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="NEST-XXXX"
            className="w-full px-3 py-2.5 neo-input font-mono text-lg tracking-[0.15em] uppercase"
            autoFocus
          />
          {preview && (
            <div data-testid="join-preview" className="p-3 bg-[#B9FBC0] border-2 border-gray-900 rounded-lg text-sm">
              Join <span className="font-outfit font-bold">{preview.name}</span> ({preview.parents_count} {preview.parents_count === 1 ? 'parent' : 'parents'}).
            </div>
          )}
          {error && <div className="text-sm text-red-600 font-semibold">{error}</div>}
          <p className="text-xs text-gray-500">Note: you can only switch if your current family has no data yet.</p>
          <button
            data-testid="join-submit-btn"
            onClick={submit}
            disabled={!preview}
            className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold disabled:opacity-50"
          >
            Join family
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
