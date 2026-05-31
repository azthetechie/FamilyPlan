import { useState } from 'react';
import { StickyNote, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { notes as notesApi } from '../lib/api';
import { toast } from 'sonner';

const COLORS = ['#FBF8CC', '#B9FBC0', '#90DBF4', '#E0C3FC', '#FFD6BA'];

export default function NotesCard({ notes, onChange }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', color: COLORS[0] });

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', content: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    setOpen(true);
  };

  const openEdit = (n) => {
    setEditing(n);
    setForm({ title: n.title || '', content: n.content, color: n.color || COLORS[0] });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.content.trim()) {
      toast.error('Write something');
      return;
    }
    try {
      if (editing) {
        await notesApi.update(editing.note_id, form);
        toast.success('Note updated');
      } else {
        await notesApi.create(form);
        toast.success('Note added');
      }
      setOpen(false);
      onChange();
    } catch {
      toast.error('Failed');
    }
  };

  const del = async (id) => {
    try {
      await notesApi.delete(id);
      toast.success('Deleted');
      onChange();
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="neo-card p-5 sm:p-6 h-full" data-testid="notes-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StickyNote size={18} strokeWidth={2.5} />
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-gray-500">Notes</div>
            <h2 className="font-outfit font-bold text-xl">Family board</h2>
          </div>
        </div>
        <button
          data-testid="note-add-btn"
          onClick={openNew}
          className="neo-btn bg-[#E0C3FC] px-3 py-1.5 text-sm inline-flex items-center gap-1"
        >
          <Plus size={14} strokeWidth={3} />
          Note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
          No notes yet. Leave a reminder for the family!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {notes.map((n) => (
            <div
              key={n.note_id}
              data-testid={`note-${n.note_id}`}
              className="group border-2 border-gray-900 rounded-lg p-3 shadow-[3px_3px_0px_0px_rgba(31,41,55,1)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_rgba(31,41,55,1)] transition-all cursor-pointer relative"
              style={{ backgroundColor: n.color || '#FBF8CC' }}
              onClick={() => openEdit(n)}
            >
              {n.title && <div className="font-outfit font-bold text-base mb-1 truncate">{n.title}</div>}
              <div className="text-sm text-gray-900 whitespace-pre-wrap break-words line-clamp-6">{n.content}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mt-2">
                {n.created_by_name} · {new Date(n.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </div>
              <button
                data-testid={`note-delete-${n.note_id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  del(n.note_id);
                }}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-gray-900 rounded-md p-1 hover:bg-red-100"
              >
                <Trash2 size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)]">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">{editing ? 'Edit note' : 'New note'}</DialogTitle>
            <DialogDescription>Write a short title and content. Pick a colour for the sticky note.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3 pt-2">
            <input
              data-testid="note-title-input"
              type="text"
              placeholder="Title (optional)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2.5 neo-input font-medium"
            />
            <textarea
              data-testid="note-content-input"
              placeholder="What's on your mind?"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full px-3 py-2.5 neo-input min-h-[140px]"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Color</span>
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  data-testid={`note-color-${c}`}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full border-2 border-gray-900 transition-transform ${form.color === c ? 'scale-125 shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button data-testid="note-save-btn" type="submit" className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold">
              {editing ? 'Save changes' : 'Add note'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
