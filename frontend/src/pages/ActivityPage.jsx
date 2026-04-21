import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { activity } from '../lib/api';
import Navigation from '../components/Navigation';
import { ChevronLeft, Sparkles, Loader2, Calendar, ShoppingBag, StickyNote, UtensilsCrossed, Crown, Users } from 'lucide-react';

const ICON_BY_ACTION = {
  'event.create': Calendar,
  'shopping.add': ShoppingBag,
  'note.create': StickyNote,
  'meal.create': UtensilsCrossed,
  'meals.to_shopping': ShoppingBag,
  'family.transfer_ownership': Crown,
};

const COLOR_BY_ACTION = {
  'event.create': '#90DBF4',
  'shopping.add': '#B9FBC0',
  'note.create': '#FBF8CC',
  'meal.create': '#E0C3FC',
  'meals.to_shopping': '#B9FBC0',
  'family.transfer_ownership': '#FFD6BA',
};

function relativeTime(iso) {
  const then = new Date(iso);
  const diff = (Date.now() - then.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return then.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByDay(items) {
  const groups = {};
  for (const a of items) {
    const d = new Date(a.created_at);
    const k = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    groups[k] = groups[k] || [];
    groups[k].push(a);
  }
  return groups;
}

export default function ActivityPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (before) => {
    setBusy(true);
    try {
      const params = { limit: 50 };
      if (before) params.before = before;
      const data = await activity.list(params);
      if (before) {
        setItems((prev) => [...prev, ...data]);
      } else {
        setItems(data);
      }
      if (!data || data.length < 50) setHasMore(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/', { replace: true });
      return;
    }
    if (user) load();
  }, [user, loading, navigate, load]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  const groups = groupByDay(items);

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="activity-page">
      <Navigation user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <button
          data-testid="activity-back-btn"
          onClick={() => navigate('/dashboard')}
          className="neo-btn bg-white px-3 py-1.5 text-sm inline-flex items-center gap-1 mb-6"
        >
          <ChevronLeft size={14} strokeWidth={3} /> Dashboard
        </button>

        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Family Log</div>
          <h1 className="font-outfit text-4xl sm:text-5xl font-extrabold tracking-tighter">
            What's been{' '}
            <span className="bg-[#E0C3FC] px-2 border-2 border-gray-900 rounded-md -rotate-1 inline-block">
              happening
            </span>
          </h1>
          <p className="text-gray-600 mt-2">A timeline of everything your family added recently.</p>
        </div>

        {items.length === 0 && !busy && (
          <div className="neo-card p-8 text-center text-gray-500">
            <Sparkles size={28} className="mx-auto mb-2 text-gray-400" />
            No activity yet. As your family uses the app, you'll see updates here.
          </div>
        )}

        <div className="space-y-8" data-testid="activity-list">
          {Object.entries(groups).map(([day, list]) => (
            <div key={day}>
              <div className="text-xs uppercase tracking-widest font-bold text-gray-600 mb-3">{day}</div>
              <ul className="space-y-2">
                {list.map((a) => {
                  const Icon = ICON_BY_ACTION[a.action] || Users;
                  const bg = COLOR_BY_ACTION[a.action] || '#FBF8CC';
                  return (
                    <li
                      key={a.activity_id}
                      data-testid={`activity-${a.activity_id}`}
                      className="flex items-start gap-3 p-3 border-2 border-gray-900 rounded-lg bg-white shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]"
                    >
                      <div
                        className="w-9 h-9 border-2 border-gray-900 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: bg }}
                      >
                        <Icon size={16} strokeWidth={2.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-outfit font-bold">{a.user_name}</span>
                          {' '}
                          <span className="text-gray-700">{a.summary}</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mt-0.5">
                          {relativeTime(a.created_at)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {hasMore && items.length > 0 && (
          <button
            data-testid="activity-load-more-btn"
            disabled={busy}
            onClick={() => load(items[items.length - 1].created_at)}
            className="neo-btn bg-white px-4 py-2.5 mt-8 mx-auto block font-bold disabled:opacity-50"
          >
            {busy ? 'Loading…' : 'Load older'}
          </button>
        )}
      </main>
    </div>
  );
}
