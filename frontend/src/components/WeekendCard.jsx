import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';

function getWeekendDates() {
  const today = new Date();
  const day = today.getDay();
  // Next Saturday
  const daysToSat = (6 - day + 7) % 7;
  const sat = new Date(today);
  sat.setDate(today.getDate() + (daysToSat === 0 && day !== 6 ? 7 : daysToSat));
  if (day === 6) sat.setDate(today.getDate()); // today is saturday
  if (day === 0) {
    sat.setDate(today.getDate() - 1); // yesterday was saturday; use today as Sunday
  }
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return [sat, sun];
}

function dateKeyLocal(d) {
  return dateKey(d);
}

export default function WeekendCard({ events }) {
  const [sat, sun] = useMemo(() => getWeekendDates(), []);
  const satKey = dateKeyLocal(sat);
  const sunKey = dateKeyLocal(sun);
  const expanded = useMemo(() => expandEvents(events, sat, sun), [events, sat, sun]);
  const satEvents = expanded.filter((e) => e.date === satKey);
  const sunEvents = expanded.filter((e) => e.date === sunKey);

  return (
    <div className="neo-card p-5 h-full bg-[#FBF8CC]" data-testid="weekend-card">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} strokeWidth={2.5} />
        <div>
          <div className="text-xs uppercase tracking-widest font-bold text-gray-700">Weekend Planner</div>
          <h2 className="font-outfit font-bold text-xl">This weekend</h2>
        </div>
      </div>

      <div className="space-y-4">
        <DayBlock label="Saturday" date={sat} events={satEvents} accent="#FFD6BA" />
        <DayBlock label="Sunday" date={sun} events={sunEvents} accent="#E0C3FC" />
      </div>
    </div>
  );
}

function DayBlock({ label, date, events, accent }) {
  return (
    <div className="border-2 border-gray-900 rounded-lg bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full border border-gray-900" style={{ backgroundColor: accent }} />
          <span className="font-outfit font-bold">{label}</span>
        </div>
        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">
          {date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="text-xs text-gray-500 py-2">Nothing planned yet</div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.occurrence_key || e.event_id} data-testid={`weekend-event-${e.event_id}`} className="text-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color || '#90DBF4' }} />
              <span className="font-semibold truncate flex items-center gap-1">
                {e.title}
                {e.recurring && e.recurring !== 'none' && <Repeat size={11} className="text-gray-500" />}
              </span>
              {e.time && <span className="text-xs text-gray-500 ml-auto">{e.time}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
