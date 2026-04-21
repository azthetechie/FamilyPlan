import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, Repeat, Bell, Pencil, SkipForward } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { events as eventsApi } from '../lib/api';
import { toast } from 'sonner';
import { expandEvents, dateKey as toDateKey } from '../lib/events';

const CATEGORIES = [
  { value: 'general', label: 'General', color: '#90DBF4' },
  { value: 'school', label: 'School', color: '#FFD6BA' },
  { value: 'sport', label: 'Sport', color: '#B9FBC0' },
  { value: 'family', label: 'Family', color: '#E0C3FC' },
  { value: 'work', label: 'Work', color: '#FBF8CC' },
];

const RECURRING_OPTIONS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'No reminder' },
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  // Start from Monday as first column? Keep Sunday-first to match AU weekend highlight naturally.
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dateKey(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarCard({ events, members, onChange }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(dateKey(today));
  const [open, setOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editMode, setEditMode] = useState('series'); // 'single' | 'series'
  const [actionDialog, setActionDialog] = useState(null); // { event, occurrenceDate, action }
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: dateKey(today),
    time: '',
    category: 'general',
    assigned_to: [],
    recurring: 'none',
    recur_until: '',
    reminder_minutes: 0,
  });

  const grid = useMemo(
    () => getMonthGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  );

  // Expand recurring events over the current visible month range for display
  const expanded = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    return expandEvents(events, first, last);
  }, [events, viewDate]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of expanded) {
      map[e.date] = map[e.date] || [];
      map[e.date].push(e);
    }
    return map;
  }, [expanded]);

  const selectedEvents = eventsByDate[selected] || [];

  const monthName = viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const openAdd = (prefillDate) => {
    setEditingEvent(null);
    setForm({
      title: '',
      description: '',
      date: prefillDate || selected,
      time: '',
      category: 'general',
      assigned_to: [],
      recurring: 'none',
      recur_until: '',
      reminder_minutes: 0,
    });
    setOpen(true);
  };

  const openEdit = (event, occurrenceDate) => {
    setEditingEvent({ ...event, _occurrence_date: occurrenceDate || event.date });
    setForm({
      title: event.title || '',
      description: event.description || '',
      date: occurrenceDate || event.date,
      time: event.time || '',
      category: event.category || 'general',
      assigned_to: event.assigned_to || [],
      recurring: event.recurring || 'none',
      recur_until: event.recur_until || '',
      reminder_minutes: event.reminder_minutes || 0,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Please add a title');
      return;
    }
    const cat = CATEGORIES.find((c) => c.value === form.category) || CATEGORIES[0];
    const payload = { ...form, color: cat.color };
    try {
      if (editingEvent) {
        if (editMode === 'single' && (editingEvent.recurring || 'none') !== 'none') {
          // Create a new standalone event for this occurrence + add exception on the original
          const occDate = editingEvent._occurrence_date;
          await eventsApi.create({ ...payload, recurring: 'none', recur_until: '' });
          await eventsApi.addException(editingEvent.event_id, occDate);
          toast.success('Occurrence edited');
        } else {
          // Edit the whole series
          await eventsApi.update(editingEvent.event_id, payload);
          toast.success('Event updated');
        }
      } else {
        await eventsApi.create(payload);
        toast.success('Event added');
      }
      setOpen(false);
      setEditingEvent(null);
      setEditMode('series');
      onChange();
    } catch (err) {
      toast.error('Failed to save event');
    }
  };

  const askActionForRecurring = (event, occurrenceDate, action) => {
    setActionDialog({ event, occurrenceDate, action });
  };

  const performAction = async (scope) => {
    const { event, occurrenceDate, action } = actionDialog;
    setActionDialog(null);
    try {
      if (action === 'delete') {
        if (scope === 'single') {
          await eventsApi.addException(event.event_id, occurrenceDate);
          toast.success('Occurrence skipped');
        } else {
          await eventsApi.delete(event.event_id);
          toast.success('Series deleted');
        }
        onChange();
      } else if (action === 'edit') {
        setEditMode(scope);
        openEdit(event, occurrenceDate);
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const del = async (event, occurrenceDate) => {
    if ((event.recurring || 'none') !== 'none') {
      askActionForRecurring(event, occurrenceDate, 'delete');
      return;
    }
    try {
      await eventsApi.delete(event.event_id);
      toast.success('Event removed');
      onChange();
    } catch {
      toast.error('Delete failed');
    }
  };

  const edit = (event, occurrenceDate) => {
    if ((event.recurring || 'none') !== 'none') {
      askActionForRecurring(event, occurrenceDate, 'edit');
      return;
    }
    setEditMode('series');
    openEdit(event, occurrenceDate);
  };

  const assigneesLabel = (ids) => {
    if (!ids || !ids.length) return '';
    const all = [
      ...members.parents.map((p) => ({ id: p.user_id, name: p.name })),
      ...members.children.map((c) => ({ id: c.child_id, name: c.name })),
    ];
    return ids
      .map((id) => all.find((a) => a.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  const toggleAssign = (id) => {
    setForm((f) =>
      f.assigned_to.includes(id)
        ? { ...f, assigned_to: f.assigned_to.filter((x) => x !== id) }
        : { ...f, assigned_to: [...f.assigned_to, id] }
    );
  };

  return (
    <div className="neo-card p-5 sm:p-6 h-full" data-testid="calendar-card">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs uppercase tracking-widest font-bold text-gray-500">Calendar</div>
          <h2 className="font-outfit font-bold text-2xl">{monthName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="calendar-prev-btn"
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            className="neo-btn bg-white px-2 py-1 text-sm"
          >
            ‹
          </button>
          <button
            data-testid="calendar-next-btn"
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            className="neo-btn bg-white px-2 py-1 text-sm"
          >
            ›
          </button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingEvent(null); setEditMode('series'); } }}>
            <DialogTrigger asChild>
              <button
                data-testid="calendar-add-event-btn"
                onClick={() => openAdd()}
                className="neo-btn bg-[#B9FBC0] px-3 py-1.5 text-sm inline-flex items-center gap-1"
              >
                <Plus size={14} strokeWidth={3} />
                Event
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)]">
              <DialogHeader>
                <DialogTitle className="font-outfit text-2xl">
                  {editingEvent
                    ? editMode === 'single' ? 'Edit this occurrence' : 'Edit series'
                    : 'New Event'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3 pt-2">
                <input
                  data-testid="event-title-input"
                  type="text"
                  placeholder="Event title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2.5 neo-input font-medium"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    data-testid="event-date-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="px-3 py-2.5 neo-input"
                  />
                  <input
                    data-testid="event-time-input"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="px-3 py-2.5 neo-input"
                  />
                </div>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger data-testid="event-category-select" className="neo-input border-2 border-gray-300 focus:border-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="inline-block w-3 h-3 rounded-full mr-2 border border-gray-900" style={{ backgroundColor: c.color }} />
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <textarea
                  data-testid="event-notes-input"
                  placeholder="Notes (optional)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2.5 neo-input min-h-[72px]"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 flex items-center gap-1">
                      <Repeat size={12} strokeWidth={3} /> Repeat
                    </label>
                    <Select
                      value={form.recurring}
                      onValueChange={(v) => setForm({ ...form, recurring: v })}
                    >
                      <SelectTrigger data-testid="event-recurring-select" className="neo-input border-2 border-gray-300 focus:border-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRING_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 flex items-center gap-1">
                      <Bell size={12} strokeWidth={3} /> Reminder
                    </label>
                    <Select
                      value={String(form.reminder_minutes)}
                      onValueChange={(v) => setForm({ ...form, reminder_minutes: parseInt(v, 10) })}
                    >
                      <SelectTrigger data-testid="event-reminder-select" className="neo-input border-2 border-gray-300 focus:border-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REMINDER_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.recurring !== 'none' && (
                  <div>
                    <label className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1 block">Repeat until (optional)</label>
                    <input
                      data-testid="event-recur-until-input"
                      type="date"
                      value={form.recur_until}
                      onChange={(e) => setForm({ ...form, recur_until: e.target.value })}
                      className="w-full px-3 py-2.5 neo-input"
                    />
                  </div>
                )}
                {(members.parents.length > 0 || members.children.length > 0) && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Assign to</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ...members.parents.map((p) => ({ id: p.user_id, name: p.name, color: '#90DBF4' })),
                        ...members.children.map((c) => ({ id: c.child_id, name: c.name, color: c.color })),
                      ].map((a) => {
                        const active = form.assigned_to.includes(a.id);
                        return (
                          <button
                            type="button"
                            key={a.id}
                            data-testid={`event-assign-${a.id}`}
                            onClick={() => toggleAssign(a.id)}
                            className={`px-3 py-1.5 border-2 border-gray-900 rounded-full text-xs font-semibold transition-all ${active ? 'shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]' : 'opacity-60'}`}
                            style={{ backgroundColor: active ? a.color : '#fff' }}
                          >
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  data-testid="event-save-btn"
                  type="submit"
                  className="neo-btn bg-[#B9FBC0] px-4 py-2.5 w-full font-bold"
                >
                  {editingEvent
                    ? editMode === 'single' ? 'Save this occurrence' : 'Save series'
                    : 'Save event'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
          <div key={d} className={`text-center text-[10px] uppercase tracking-widest font-bold ${i === 0 || i === 6 ? 'text-[#B45309]' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d, idx) => {
          if (!d) return <div key={idx} className="aspect-square" />;
          const key = dateKey(d);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const isToday = key === dateKey(today);
          const isSelected = key === selected;
          const dayEvents = eventsByDate[key] || [];
          return (
            <button
              key={key}
              data-testid={`calendar-day-${key}`}
              onClick={() => setSelected(key)}
              className={`relative aspect-square flex flex-col items-center justify-start pt-1.5 rounded-md text-xs font-semibold border-2 transition-all hover:-translate-y-0.5
                ${isSelected ? 'border-gray-900 bg-gray-900 text-white shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]' : 'border-transparent'}
                ${!isSelected && isWeekend ? 'bg-[#FBF8CC]/60' : ''}
                ${!isSelected && isToday ? 'bg-[#B9FBC0] border-gray-900' : ''}
              `}
            >
              <span>{d.getDate()}</span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dayEvents.slice(0, 3).map((e, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full border ${isSelected ? 'border-white' : 'border-gray-900'}`} style={{ backgroundColor: e.color || '#90DBF4' }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      <div className="mt-5 border-t-2 border-gray-900 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} strokeWidth={2.5} />
            <span className="font-outfit font-bold">
              {new Date(selected + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
          </div>
          <button
            data-testid="calendar-quick-add-btn"
            onClick={() => openAdd(selected)}
            className="text-xs font-bold text-gray-700 hover:text-gray-900 underline"
          >
            + Quick add
          </button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {selectedEvents.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center border-2 border-dashed border-gray-300 rounded-lg">
              No events. Add one to get started.
            </div>
          ) : (
            selectedEvents.map((e) => (
              <div
                key={e.occurrence_key || e.event_id}
                data-testid={`event-${e.event_id}`}
                className="flex items-start gap-3 p-3 border-2 border-gray-900 rounded-lg group"
                style={{ backgroundColor: (e.color || '#90DBF4') + '50' }}
              >
                <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: e.color || '#90DBF4' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold font-outfit flex items-center gap-2 flex-wrap">
                    {e.title}
                    {e.recurring && e.recurring !== 'none' && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-gray-700 bg-white border border-gray-900 px-1.5 py-0.5 rounded">
                        <Repeat size={10} strokeWidth={3} />
                        {e.recurring}
                      </span>
                    )}
                    {e.reminder_minutes > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-gray-700 bg-white border border-gray-900 px-1.5 py-0.5 rounded">
                        <Bell size={10} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  {e.time && <div className="text-xs text-gray-700">{e.time}</div>}
                  {e.description && <div className="text-xs text-gray-700 mt-0.5">{e.description}</div>}
                  {e.assigned_to?.length > 0 && (
                    <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mt-1">
                      {assigneesLabel(e.assigned_to)}
                    </div>
                  )}
                </div>
                <button
                  data-testid={`event-edit-${e.event_id}`}
                  onClick={() => edit(e, e.date)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-700 hover:text-gray-900"
                  title="Edit event"
                >
                  <Pencil size={16} strokeWidth={2.5} />
                </button>
                {(e.recurring || 'none') !== 'none' && (
                  <button
                    data-testid={`event-skip-${e.event_id}`}
                    onClick={async () => {
                      try {
                        await eventsApi.addException(e.event_id, e.date);
                        toast.success('Skipped this one');
                        onChange();
                      } catch {
                        toast.error('Failed to skip');
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-700 hover:text-amber-700"
                    title="Skip just this occurrence"
                  >
                    <SkipForward size={16} strokeWidth={2.5} />
                  </button>
                )}
                <button
                  data-testid={`event-delete-${e.event_id}`}
                  onClick={() => del(e, e.date)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-700 hover:text-red-600"
                  title={(e.recurring || 'none') !== 'none' ? 'Delete event / occurrence' : 'Delete event'}
                >
                  <Trash2 size={16} strokeWidth={2.5} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recurring action chooser dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl">
              {actionDialog?.action === 'delete' ? 'Delete recurring event' : 'Edit recurring event'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-gray-600">
              "{actionDialog?.event?.title}" repeats {actionDialog?.event?.recurring}.
              {actionDialog?.action === 'delete' ? ' What do you want to delete?' : ' What do you want to edit?'}
            </p>
            <button
              data-testid="action-single-btn"
              onClick={() => performAction('single')}
              className="neo-btn bg-[#FBF8CC] w-full py-2.5 font-bold text-left px-3"
            >
              {actionDialog?.action === 'delete' ? 'Just this occurrence' : 'This occurrence only'}
              <div className="text-xs font-normal text-gray-600 mt-0.5">
                {actionDialog?.occurrenceDate &&
                  new Date(actionDialog.occurrenceDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
              </div>
            </button>
            <button
              data-testid="action-series-btn"
              onClick={() => performAction('series')}
              className="neo-btn bg-[#FFD6BA] w-full py-2.5 font-bold text-left px-3"
            >
              {actionDialog?.action === 'delete' ? 'Entire series' : 'All events in series'}
              <div className="text-xs font-normal text-gray-600 mt-0.5">Affects every occurrence</div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
