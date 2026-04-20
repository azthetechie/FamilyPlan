import { useState } from 'react';
import { Users, Plus, X, UserCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { family } from '../lib/api';
import { toast } from 'sonner';

const CHILD_COLORS = ['#FFD6BA', '#B9FBC0', '#90DBF4', '#E0C3FC', '#FBF8CC'];

export default function FamilyCard({ members, onChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', age: '', color: CHILD_COLORS[0] });

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
    } catch {
      toast.error('Failed to add child');
    }
  };

  const del = async (id) => {
    try {
      await family.deleteChild(id);
      toast.success('Removed');
      onChange();
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="neo-card p-5 sm:p-6" data-testid="family-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} strokeWidth={2.5} />
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-gray-500">Family</div>
            <h2 className="font-outfit font-bold text-xl">Our crew</h2>
          </div>
        </div>
        <button
          data-testid="add-child-btn"
          onClick={() => setOpen(true)}
          className="neo-btn bg-[#FFD6BA] px-3 py-1.5 text-sm inline-flex items-center gap-1"
        >
          <Plus size={14} strokeWidth={3} />
          Add child
        </button>
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
    </div>
  );
}
