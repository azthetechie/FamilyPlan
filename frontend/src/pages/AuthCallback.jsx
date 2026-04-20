import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const sessionId = params.get('session_id');

    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }

    (async () => {
      try {
        const inviteToken = sessionStorage.getItem('pending_invite') || null;
        const data = await auth.exchangeSession(sessionId, inviteToken);
        if (inviteToken) sessionStorage.removeItem('pending_invite');
        setUser(data);
        window.history.replaceState(null, '', '/dashboard');
        navigate('/dashboard', { replace: true, state: { user: data } });
      } catch (e) {
        console.error('Auth exchange failed', e);
        navigate('/', { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
      <div className="neo-card p-8 text-center">
        <Loader2 className="animate-spin mx-auto mb-4" size={32} />
        <p className="font-outfit font-bold text-lg">Signing you in...</p>
        <p className="text-sm text-gray-600 mt-1">Welcome to your family dashboard</p>
      </div>
    </div>
  );
}
