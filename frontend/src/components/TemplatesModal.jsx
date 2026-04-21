import { useState, useEffect } from 'react';
import { ClipboardList, Plus, Trash2, Play, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { shopping } from '../lib/api';
import { toast } from 'sonner';

const SUPERMARKETS = ['Any', 'Coles', 'Woolworths', 'Aldi', 'IGA', 'Foodworks'];

export default function TemplatesModal({ open, onOpenChange, onApplied }) {
  const [templates, setTemplates] = useState([]);
  const [mode, setMode] = useState('list'); // list | create
  const [name, setName] = useState('');
  const [items, setItems] = useState([{ name: '', supermarket: 'Any' }]);

  const load = async () => {
    try {
      const t = await shopping.templates.list();
      setTemplates(t);
    } catch {
      toast.error('Failed to load templates');
    }
  };

  useEffect(() => {
    if (open) load();
    if (!open) { setMode('list'); setName(''); setItems([{ name: '', supermarket: 'Any' }]); }
  }, [open]);

  const addItemRow = () => setItems([...items, { name: '', supermarket: 'Any' }]);
  const removeItemRow = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], [field]: value };
    setItems(copy);
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name your template');
    const validItems = items.filter((i) => i.name.trim());
    if (!validItems.length) return toast.error('Add at least one item');
    try {
      await shopping.templates.create({ name: name.trim(), items: validItems });
      toast.success('Template saved');
      setMode('list');
      setName('');
      setItems([{ name: '', supermarket: 'Any' }]);
      load();
    } catch {
      toast.error('Failed to save template');
    }
  };

  const applyTemplate = async (id, tplName) => {
    try {
      const res = await shopping.templates.apply(id);
      toast.success(`Added ${res.added} items from "${tplName}"`);
      onApplied();
      onOpenChange(false);
    } catch {
      toast.error('Apply failed');
    }
  };

  const deleteTemplate = async (id) => {
    try {
      await shopping.templates.delete(id);
      toast.success('Template deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
            <ClipboardList size={22} /> Shopping Templates
          </DialogTitle>
        </DialogHeader>

        {mode === 'list' && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-gray-600">Save a typical weekly shop and apply it with one click.</p>
            {templates.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center border-2 border-dashed border-gray-300 rounded-lg">
                No templates yet. Save your weekly essentials!
              </div>
            ) : (
              <ul className="space-y-2" data-testid="templates-list">
                {templates.map((t) => (
                  <li
                    key={t.template_id}
                    data-testid={`template-${t.template_id}`}
                    className="p-3 bg-white border-2 border-gray-900 rounded-lg shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-outfit font-bold">{t.name}</div>
                        <div className="text-xs text-gray-500">{t.items?.length || 0} items</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          data-testid={`apply-template-${t.template_id}`}
                          onClick={() => applyTemplate(t.template_id, t.name)}
                          className="neo-btn bg-[#B9FBC0] px-3 py-1.5 text-sm inline-flex items-center gap-1"
                        >
                          <Play size={12} strokeWidth={3} /> Apply
                        </button>
                        <button
                          data-testid={`delete-template-${t.template_id}`}
                          onClick={() => deleteTemplate(t.template_id)}
                          className="neo-btn bg-white px-2 py-1.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(t.items || []).slice(0, 8).map((it, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 bg-gray-100 border border-gray-300 rounded-full">{it.name}</span>
                      ))}
                      {t.items && t.items.length > 8 && (
                        <span className="text-[11px] text-gray-500">+{t.items.length - 8} more</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              data-testid="new-template-btn"
              onClick={() => setMode('create')}
              className="neo-btn bg-[#E0C3FC] px-4 py-2.5 w-full font-bold inline-flex items-center justify-center gap-1"
            >
              <Plus size={16} strokeWidth={3} /> New template
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={saveTemplate} className="space-y-3 pt-2">
            <input
              data-testid="template-name-input"
              type="text"
              placeholder="Template name (e.g. Weekly essentials)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 neo-input font-medium"
              autoFocus
            />
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    data-testid={`template-item-name-${idx}`}
                    value={it.name}
                    onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    placeholder="Item name"
                    className="flex-1 neo-input px-2 py-1.5 text-sm"
                  />
                  <select
                    data-testid={`template-item-supermarket-${idx}`}
                    value={it.supermarket}
                    onChange={(e) => updateItem(idx, 'supermarket', e.target.value)}
                    className="neo-input px-2 py-1.5 text-sm"
                  >
                    {SUPERMARKETS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {items.length > 1 && (
                    <button
                      type="button"
                      data-testid={`remove-item-row-${idx}`}
                      onClick={() => removeItemRow(idx)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              data-testid="add-item-row-btn"
              onClick={addItemRow}
              className="text-xs font-bold text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
            >
              <Plus size={12} strokeWidth={3} /> Add another item
            </button>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="neo-btn bg-white px-3 py-2.5 flex-1 font-bold"
              >
                Cancel
              </button>
              <button
                data-testid="save-template-btn"
                type="submit"
                className="neo-btn bg-[#B9FBC0] px-3 py-2.5 flex-1 font-bold"
              >
                Save template
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
