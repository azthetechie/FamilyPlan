import { useState, useEffect } from 'react';
import { BookmarkPlus, Plus, Trash2, Play, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { meals } from '../lib/api';
import { toast } from 'sonner';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', icon: '🥞' },
  { value: 'lunch', label: 'Lunch', icon: '🥪' },
  { value: 'dinner', label: 'Dinner', icon: '🍝' },
  { value: 'snack', label: 'Snack', icon: '🍎' },
];

export default function MealTemplatesModal({ open, onOpenChange, onApplied, weekDates = [] }) {
  const [templates, setTemplates] = useState([]);
  const [mode, setMode] = useState('list');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', meal_type_default: 'dinner', ingredients: '', notes: '' });
  const [applyTarget, setApplyTarget] = useState(null);

  const load = async () => {
    try {
      setTemplates(await meals.templates.list());
    } catch {
      toast.error('Failed to load templates');
    }
  };

  useEffect(() => {
    if (open) {
      load();
    } else {
      setMode('list'); setEditing(null); setApplyTarget(null);
      setForm({ name: '', meal_type_default: 'dinner', ingredients: '', notes: '' });
    }
  }, [open]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Template name required');
    const payload = {
      name: form.name.trim(),
      meal_type_default: form.meal_type_default,
      ingredients: form.ingredients.split(',').map((s) => s.trim()).filter(Boolean),
      notes: form.notes.trim(),
    };
    try {
      if (editing) {
        await meals.templates.update(editing.meal_template_id, payload);
        toast.success('Template updated');
      } else {
        await meals.templates.create(payload);
        toast.success('Template saved');
      }
      setMode('list'); setEditing(null);
      setForm({ name: '', meal_type_default: 'dinner', ingredients: '', notes: '' });
      load();
    } catch {
      toast.error('Save failed');
    }
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name,
      meal_type_default: t.meal_type_default || 'dinner',
      ingredients: (t.ingredients || []).join(', '),
      notes: t.notes || '',
    });
    setMode('create');
  };

  const del = async (id) => {
    try {
      await meals.templates.delete(id);
      toast.success('Removed');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const apply = async (date, meal_type) => {
    if (!applyTarget) return;
    try {
      await meals.templates.apply(applyTarget.meal_template_id, date, meal_type);
      toast.success(`Added "${applyTarget.name}" to ${meal_type} on ${date}`);
      setApplyTarget(null);
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Apply failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
            <BookmarkPlus size={22} /> Meal Templates
          </DialogTitle>
          <DialogDescription>
            Save your favourite meals (e.g. "Taco Tuesday") and drop them into any day with one tap.
          </DialogDescription>
        </DialogHeader>

        {applyTarget && (
          <div className="space-y-3 pt-2">
            <div className="p-3 bg-[#FBF8CC] border-2 border-gray-900 rounded-lg">
              <div className="text-xs uppercase tracking-widest font-bold text-gray-700">Apply</div>
              <div className="font-outfit font-bold">{applyTarget.name}</div>
              {applyTarget.ingredients?.length > 0 && (
                <div className="text-xs text-gray-700 mt-1">{applyTarget.ingredients.join(', ')}</div>
              )}
            </div>
            <p className="text-sm text-gray-600">Pick a day & meal:</p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {weekDates.map((d) => (
                <div key={d.toISOString()} className="border-2 border-gray-900 rounded-lg p-2 bg-white">
                  <div className="font-outfit font-bold text-sm mb-1.5">
                    {d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MEAL_TYPES.map((mt) => (
                      <button
                        key={mt.value}
                        data-testid={`apply-tpl-${d.toISOString().slice(0,10)}-${mt.value}`}
                        onClick={() => {
                          const y = d.getFullYear();
                          const m = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          apply(`${y}-${m}-${day}`, mt.value);
                        }}
                        className="neo-btn bg-white px-2 py-1.5 text-xs font-semibold hover:bg-[#FBF8CC]"
                        title={mt.label}
                      >
                        <span className="mr-1">{mt.icon}</span>
                        <span className="hidden sm:inline">{mt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setApplyTarget(null)}
              className="text-xs text-gray-600 hover:text-gray-900 font-bold w-full text-center"
            >
              Cancel
            </button>
          </div>
        )}

        {!applyTarget && mode === 'list' && (
          <div className="space-y-3 pt-2">
            {templates.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center border-2 border-dashed border-gray-300 rounded-lg">
                No meal templates yet. Save your first one!
              </div>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto pr-1" data-testid="meal-templates-list">
                {templates.map((t) => {
                  const mt = MEAL_TYPES.find((x) => x.value === t.meal_type_default) || MEAL_TYPES[2];
                  return (
                    <li
                      key={t.meal_template_id}
                      data-testid={`meal-template-${t.meal_template_id}`}
                      className="p-3 bg-white border-2 border-gray-900 rounded-lg shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="min-w-0">
                          <div className="font-outfit font-bold flex items-center gap-1.5">
                            <span>{mt.icon}</span>
                            {t.name}
                          </div>
                          <div className="text-xs text-gray-500">{t.ingredients?.length || 0} ingredients · default: {mt.label}</div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            data-testid={`apply-meal-tpl-${t.meal_template_id}`}
                            onClick={() => setApplyTarget(t)}
                            className="neo-btn bg-[#B9FBC0] px-2.5 py-1.5 text-sm inline-flex items-center gap-1"
                          >
                            <Play size={12} strokeWidth={3} /> Apply
                          </button>
                          <button
                            onClick={() => openEdit(t)}
                            className="neo-btn bg-white px-2 py-1.5"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            data-testid={`delete-meal-tpl-${t.meal_template_id}`}
                            onClick={() => del(t.meal_template_id)}
                            className="neo-btn bg-white px-2 py-1.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      {t.ingredients?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {t.ingredients.slice(0, 6).map((i, idx) => (
                            <span key={idx} className="text-[11px] px-2 py-0.5 bg-gray-100 border border-gray-300 rounded-full">{i}</span>
                          ))}
                          {t.ingredients.length > 6 && (
                            <span className="text-[11px] text-gray-500">+{t.ingredients.length - 6} more</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              data-testid="new-meal-tpl-btn"
              onClick={() => setMode('create')}
              className="neo-btn bg-[#E0C3FC] px-4 py-2.5 w-full font-bold inline-flex items-center justify-center gap-1"
            >
              <Plus size={16} strokeWidth={3} /> New meal template
            </button>
          </div>
        )}

        {!applyTarget && mode === 'create' && (
          <form onSubmit={save} className="space-y-3 pt-2">
            <input
              data-testid="meal-tpl-name-input"
              type="text"
              placeholder="Template name (e.g. Taco Tuesday)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 neo-input font-medium"
              autoFocus
            />
            <div>
              <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 block">
                Default meal time
              </label>
              <Select
                value={form.meal_type_default}
                onValueChange={(v) => setForm({ ...form, meal_type_default: v })}
              >
                <SelectTrigger data-testid="meal-tpl-type-select" className="neo-input border-2 border-gray-300 focus:border-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="mr-1.5">{m.icon}</span>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 block">
                Ingredients (comma-separated)
              </label>
              <textarea
                data-testid="meal-tpl-ingredients-input"
                placeholder="Tortillas, mince, beans, lettuce, cheese, salsa"
                value={form.ingredients}
                onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                className="w-full px-3 py-2.5 neo-input min-h-[72px]"
              />
            </div>
            <textarea
              data-testid="meal-tpl-notes-input"
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2.5 neo-input min-h-[48px]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('list'); setEditing(null); }}
                className="neo-btn bg-white px-3 py-2.5 flex-1 font-bold"
              >
                Cancel
              </button>
              <button
                data-testid="meal-tpl-save-btn"
                type="submit"
                className="neo-btn bg-[#B9FBC0] px-3 py-2.5 flex-1 font-bold"
              >
                {editing ? 'Save changes' : 'Save template'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
