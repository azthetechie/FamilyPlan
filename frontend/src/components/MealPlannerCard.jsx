import { useState, useMemo, useEffect, Fragment } from 'react';
import { UtensilsCrossed, Plus, Trash2, ChevronLeft, ChevronRight, ShoppingBag, Pencil, BookmarkPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { meals as mealsApi } from '../lib/api';
import { toast } from 'sonner';
import { dateKey, parseDate } from '../lib/events';
import MealTemplatesModal from './MealTemplatesModal';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', icon: '🥞', color: '#FFD6BA' },
  { value: 'lunch', label: 'Lunch', icon: '🥪', color: '#B9FBC0' },
  { value: 'dinner', label: 'Dinner', icon: '🍝', color: '#E0C3FC' },
  { value: 'snack', label: 'Snack', icon: '🍎', color: '#FBF8CC' },
];

function startOfWeek(d) {
  // Week starts Monday
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift so Monday=start
  const res = new Date(d);
  res.setDate(d.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}

function addDays(d, n) {
  const res = new Date(d);
  res.setDate(d.getDate() + n);
  return res;
}

export default function MealPlannerCard() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [list, setList] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ date: '', meal_type: 'dinner', name: '', ingredients: '', notes: '' });
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSupermarket, setSendSupermarket] = useState('Any');
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = days[6];

  const load = async () => {
    try {
      const data = await mealsApi.list(dateKey(weekStart), dateKey(weekEnd));
      setList(data);
    } catch {
      toast.error('Failed to load meals');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekStart]);

  const mealsByDate = useMemo(() => {
    const map = {};
    for (const m of list) {
      map[m.date] = map[m.date] || {};
      map[m.date][m.meal_type] = m;
    }
    return map;
  }, [list]);

  const openAdd = (date, meal_type) => {
    setEditing(null);
    setForm({ date, meal_type, name: '', ingredients: '', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (meal) => {
    setEditing(meal);
    setForm({
      date: meal.date,
      meal_type: meal.meal_type,
      name: meal.name,
      ingredients: (meal.ingredients || []).join(', '),
      notes: meal.notes || '',
    });
    setDialogOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Meal name required');
      return;
    }
    const ingredients = form.ingredients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      date: form.date,
      meal_type: form.meal_type,
      name: form.name.trim(),
      ingredients,
      notes: form.notes.trim(),
    };
    try {
      if (editing) {
        await mealsApi.update(editing.meal_id, payload);
        toast.success('Meal updated');
      } else {
        await mealsApi.create(payload);
        toast.success('Meal planned');
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error('Failed to save meal');
    }
  };

  const del = async (id) => {
    try {
      await mealsApi.delete(id);
      toast.success('Removed');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const sendToShopping = async () => {
    try {
      const res = await mealsApi.toShopping(dateKey(weekStart), dateKey(weekEnd), sendSupermarket);
      if (res.added > 0) {
        toast.success(`Sent ${res.added} ingredients to shopping`);
      } else {
        toast.info('No new ingredients to add');
      }
      setSendOpen(false);
    } catch {
      toast.error('Failed to send');
    }
  };

  const totalMeals = list.length;
  const totalIngredients = useMemo(
    () => {
      const set = new Set();
      for (const m of list) for (const i of (m.ingredients || [])) set.add(i.toLowerCase());
      return set.size;
    },
    [list]
  );

  const weekLabel = `${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;

  return (
    <div className="neo-card p-5 sm:p-6" data-testid="meal-planner-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={18} strokeWidth={2.5} />
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-gray-500">Meal Planner</div>
            <h2 className="font-outfit font-bold text-2xl">{weekLabel}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="meal-prev-week-btn"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="neo-btn bg-white px-2 py-1"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            data-testid="meal-this-week-btn"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="neo-btn bg-white px-3 py-1 text-xs"
          >
            Today
          </button>
          <button
            data-testid="meal-next-week-btn"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="neo-btn bg-white px-2 py-1"
          >
            <ChevronRight size={14} />
          </button>
          <button
            data-testid="meal-templates-btn"
            onClick={() => setTemplatesOpen(true)}
            className="neo-btn bg-[#E0C3FC] px-3 py-1.5 text-sm inline-flex items-center gap-1"
            title="Meal templates"
          >
            <BookmarkPlus size={14} strokeWidth={3} />
            Templates
          </button>
          <button
            data-testid="meal-send-to-shopping-btn"
            onClick={() => setSendOpen(true)}
            disabled={totalIngredients === 0}
            className="neo-btn bg-[#B9FBC0] px-3 py-1.5 text-sm inline-flex items-center gap-1 disabled:opacity-50"
            title="Send all ingredients to shopping list"
          >
            <ShoppingBag size={14} strokeWidth={3} />
            Send to shop
          </button>
        </div>
      </div>

      {/* Grid: 7 days × 4 meals */}
      <div className="overflow-x-auto -mx-2">
        <div className="min-w-[700px] px-2">
          <div className="grid grid-cols-[80px_repeat(7,minmax(110px,1fr))] gap-1.5">
            {/* Header row */}
            <div />
            {days.map((d) => {
              const isToday = dateKey(d) === dateKey(new Date());
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={'h' + dateKey(d)}
                  className={`text-center py-1.5 border-2 border-gray-900 rounded-md ${isToday ? 'bg-[#B9FBC0]' : isWeekend ? 'bg-[#FBF8CC]/60' : 'bg-white'}`}
                >
                  <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600">
                    {d.toLocaleDateString('en-AU', { weekday: 'short' })}
                  </div>
                  <div className="font-outfit font-bold text-sm">{d.getDate()}</div>
                </div>
              );
            })}

            {/* Meal rows */}
            {MEAL_TYPES.map((mt) => (
              <Fragment key={mt.value}>
                <div className="flex items-center gap-1.5 justify-end pr-1">
                  <span className="text-base" aria-hidden>{mt.icon}</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-gray-700">
                    {mt.label}
                  </span>
                </div>
                {days.map((d) => {
                  const key = dateKey(d);
                  const meal = mealsByDate[key]?.[mt.value];
                  return (
                    <div
                      key={'c-' + mt.value + '-' + key}
                      className="min-h-[60px] border-2 border-gray-300 rounded-md p-1.5 relative group hover:border-gray-900 transition-colors"
                      style={{ backgroundColor: meal ? mt.color + '60' : 'transparent' }}
                    >
                      {meal ? (
                        <div className="h-full flex flex-col" data-testid={`meal-${meal.meal_id}`}>
                          <div className="text-xs font-bold font-outfit leading-tight line-clamp-2">{meal.name}</div>
                          {meal.ingredients?.length > 0 && (
                            <div className="text-[9px] text-gray-600 mt-0.5 line-clamp-1">
                              {meal.ingredients.slice(0, 3).join(', ')}
                            </div>
                          )}
                          <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              data-testid={`meal-edit-${meal.meal_id}`}
                              onClick={() => openEdit(meal)}
                              className="p-0.5 bg-white border border-gray-900 rounded hover:bg-gray-50"
                            >
                              <Pencil size={10} strokeWidth={2.5} />
                            </button>
                            <button
                              data-testid={`meal-delete-${meal.meal_id}`}
                              onClick={() => del(meal.meal_id)}
                              className="p-0.5 bg-white border border-gray-900 rounded hover:bg-red-50"
                            >
                              <Trash2 size={10} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          data-testid={`meal-add-${mt.value}-${key}`}
                          onClick={() => openAdd(key, mt.value)}
                          className="w-full h-full flex items-center justify-center text-gray-300 hover:text-gray-700 transition-colors"
                          title={`Add ${mt.label}`}
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {totalMeals > 0 && (
        <div className="mt-3 text-xs text-gray-600">
          {totalMeals} meal{totalMeals === 1 ? '' : 's'} planned · {totalIngredients} unique ingredient{totalIngredients === 1 ? '' : 's'}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)]">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">
              {editing ? 'Edit meal' : 'Plan a meal'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Update the meal name or ingredients.' : 'Pick a day, meal time, and add ingredients you\'ll need.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <input
                data-testid="meal-date-input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="px-3 py-2.5 neo-input"
              />
              <Select value={form.meal_type} onValueChange={(v) => setForm({ ...form, meal_type: v })}>
                <SelectTrigger data-testid="meal-type-select" className="neo-input border-2 border-gray-300 focus:border-gray-900">
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
            <input
              data-testid="meal-name-input"
              type="text"
              placeholder="Meal name (e.g. Spaghetti Bolognese)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 neo-input font-medium"
              autoFocus
            />
            <div>
              <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 block">
                Ingredients (comma-separated)
              </label>
              <textarea
                data-testid="meal-ingredients-input"
                placeholder="Pasta, mince, tomato sauce, onion, garlic"
                value={form.ingredients}
                onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                className="w-full px-3 py-2.5 neo-input min-h-[72px]"
              />
            </div>
            <textarea
              data-testid="meal-notes-input"
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2.5 neo-input min-h-[48px]"
            />
            <button
              data-testid="meal-save-btn"
              type="submit"
              className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold"
            >
              {editing ? 'Save changes' : 'Plan meal'}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send-to-shopping dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl">Send to shopping</DialogTitle>
            <DialogDescription>
              Add this week's meal ingredients to your shopping list, tagged with the supermarket you choose.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-gray-600">
              Add all {totalIngredients} unique ingredient{totalIngredients === 1 ? '' : 's'} from this week's meals to your shopping list.
            </p>
            <div>
              <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 block">
                Tag all as
              </label>
              <Select value={sendSupermarket} onValueChange={setSendSupermarket}>
                <SelectTrigger data-testid="meal-send-supermarket-select" className="neo-input border-2 border-gray-300 focus:border-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Any', 'Coles', 'Woolworths', 'Aldi', 'IGA', 'Foodworks'].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              data-testid="meal-send-confirm-btn"
              onClick={sendToShopping}
              className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold"
            >
              Add to shopping list
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <MealTemplatesModal
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onApplied={load}
        weekDates={days}
      />
    </div>
  );
}

// Silence unused import (parseDate might be used in future extensions)
void parseDate;
