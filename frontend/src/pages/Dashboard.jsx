import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { events, shopping, notes, family, activity } from '../lib/api';
import Navigation from '../components/Navigation';
import CalendarCard from '../components/CalendarCard';
import ShoppingCard from '../components/ShoppingCard';
import NotesCard from '../components/NotesCard';
import FamilyCard from '../components/FamilyCard';
import WeekendCard from '../components/WeekendCard';
import MealPlannerCard from '../components/MealPlannerCard';
import { Toaster, toast } from 'sonner';
import { nextOccurrenceDateTime } from '../lib/events';
import { Bell, Sparkles as SparkIcon } from 'lucide-react';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [eventList, setEventList] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [frequent, setFrequent] = useState([]);
  const [noteList, setNoteList] = useState([]);
  const [members, setMembers] = useState({ parents: [], children: [] });
  const firedRemindersRef = useRef(new Set());
  const lastActivitySeenRef = useRef(new Date().toISOString());

  const refresh = useCallback(async () => {
    try {
      const [ev, sh, fr, nt, mb] = await Promise.all([
        events.list(),
        shopping.list(),
        shopping.frequent(),
        notes.list(),
        family.members(),
      ]);
      setEventList(ev);
      setShoppingList(sh);
      setFrequent(fr);
      setNoteList(nt);
      setMembers(mb);
    } catch (e) {
      console.error('Refresh failed', e);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/', { replace: true });
      return;
    }
    if (user) refresh();
  }, [user, loading, navigate, refresh]);

  // Ask browser notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Reminder poller — checks upcoming events every 30s
  useEffect(() => {
    const check = () => {
      const now = new Date();
      for (const e of eventList) {
        const mins = e.reminder_minutes || 0;
        if (!mins || !e.time) continue;
        const nextDt = nextOccurrenceDateTime(e, now);
        if (!nextDt) continue;
        const fireAt = new Date(nextDt.getTime() - mins * 60000);
        const key = `${e.event_id}_${nextDt.toISOString()}`;
        if (firedRemindersRef.current.has(key)) continue;
        const windowMs = 30_000;
        if (now >= fireAt && now <= new Date(fireAt.getTime() + windowMs * 4)) {
          firedRemindersRef.current.add(key);
          const timeLabel = nextDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          toast(`Reminder: ${e.title}`, {
            description: `Starts at ${timeLabel}`,
            icon: <Bell size={16} />,
            duration: 10000,
          });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(`Reminder: ${e.title}`, { body: `Starts at ${timeLabel}` });
            } catch { /* noop */ }
          }
        }
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [eventList]);

  // Real-time activity via WebSocket (with polling fallback)
  useEffect(() => {
    if (!user) return;
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
    const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + '/api/ws/activity';
    let ws = null;
    let pollId = null;
    let pingId = null;
    let closed = false;

    const handleActivity = (a) => {
      if (!a || !a.action) return;
      if (a.user_id !== user.user_id) {
        toast(`${a.user_name}`, {
          description: a.summary,
          icon: <SparkIcon size={16} />,
          duration: 6000,
        });
        refresh();
      }
      if (a.created_at && a.created_at > lastActivitySeenRef.current) {
        lastActivitySeenRef.current = a.created_at;
      }
    };

    const startPollingFallback = () => {
      if (pollId) return;
      pollId = setInterval(async () => {
        try {
          const items = await activity.list({ since: lastActivitySeenRef.current });
          if (!items || items.length === 0) return;
          const fresh = [...items].reverse();
          for (const a of fresh) handleActivity(a);
        } catch {
          // silent
        }
      }, 30_000);
    };

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        startPollingFallback();
        return;
      }
      ws.onopen = () => {
        // Clear any fallback polling once WS is live
        if (pollId) { clearInterval(pollId); pollId = null; }
        // Heartbeat
        pingId = setInterval(() => {
          try { ws.readyState === 1 && ws.send('ping'); } catch { /* noop */ }
        }, 25_000);
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === 'hello') return;
          handleActivity(data);
        } catch {
          // ignore plain "pong" text frames
        }
      };
      ws.onerror = () => { /* will trigger onclose */ };
      ws.onclose = () => {
        if (pingId) { clearInterval(pingId); pingId = null; }
        if (closed) return;
        startPollingFallback();
        // Try to reconnect after 10s
        setTimeout(() => { if (!closed) connect(); }, 10_000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (pingId) clearInterval(pingId);
      if (pollId) clearInterval(pollId);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [user, refresh]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="dashboard-root">
      <Toaster position="top-right" richColors />
      <Navigation user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Greeting */}
        <div className="mb-8 animate-slide-up">
          <div className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
            {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 className="font-outfit text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tighter text-gray-900">
            Gooday, <span className="bg-[#B9FBC0] px-2 border-2 border-gray-900 rounded-md -rotate-1 inline-block">{user.name?.split(' ')[0] || 'there'}</span> 👋
          </h1>
          <p className="text-gray-600 mt-2 font-figtree">Here's what's happening with your family.</p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-5 sm:gap-6">
          {/* Calendar - 4 cols */}
          <div className="md:col-span-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <CalendarCard events={eventList} members={members} onChange={refresh} />
          </div>

          {/* Shopping - 2 cols */}
          <div className="md:col-span-2 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <ShoppingCard items={shoppingList} frequent={frequent} onChange={refresh} />
          </div>

          {/* Weekend - 2 cols */}
          <div className="md:col-span-2 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <WeekendCard events={eventList} members={members} onChange={refresh} />
          </div>

          {/* Notes - 4 cols */}
          <div className="md:col-span-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <NotesCard notes={noteList} onChange={refresh} />
          </div>

          {/* Meal Planner - 6 cols */}
          <div className="md:col-span-6 animate-slide-up" style={{ animationDelay: '0.22s' }}>
            <MealPlannerCard />
          </div>

          {/* Family - 6 cols (full width) */}
          <div className="md:col-span-6 animate-slide-up" style={{ animationDelay: '0.25s' }}>
            <FamilyCard members={members} onChange={refresh} currentUser={user} />
          </div>
        </div>
      </main>
    </div>
  );
}
