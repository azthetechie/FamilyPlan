import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { events, shopping, notes, family } from '../lib/api';
import Navigation from '../components/Navigation';
import CalendarCard from '../components/CalendarCard';
import ShoppingCard from '../components/ShoppingCard';
import NotesCard from '../components/NotesCard';
import FamilyCard from '../components/FamilyCard';
import WeekendCard from '../components/WeekendCard';
import { Toaster, toast } from 'sonner';
import { nextOccurrenceDateTime } from '../lib/events';
import { Bell } from 'lucide-react';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [eventList, setEventList] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [frequent, setFrequent] = useState([]);
  const [noteList, setNoteList] = useState([]);
  const [members, setMembers] = useState({ parents: [], children: [] });
  const firedRemindersRef = useRef(new Set());

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

          {/* Family - 6 cols (full width) */}
          <div className="md:col-span-6 animate-slide-up" style={{ animationDelay: '0.25s' }}>
            <FamilyCard members={members} onChange={refresh} currentUser={user} />
          </div>
        </div>
      </main>
    </div>
  );
}
