import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Calendar as CalendarIcon, ShoppingBag, StickyNote, Users } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-8 items-center">
        {/* Left - Hero */}
        <div className="space-y-8 animate-slide-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#B9FBC0] border-2 border-gray-900 rounded-full text-xs font-bold uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-gray-900 pulse-ring" />
            Family Organiser
          </div>
          <h1 className="font-outfit text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[0.95] text-gray-900">
            Your family,<br />
            <span className="bg-[#FBF8CC] px-3 py-1 inline-block border-2 border-gray-900 rounded-lg -rotate-1">
              actually organised.
            </span>
          </h1>
          <p className="text-lg text-gray-600 font-figtree leading-relaxed max-w-md">
            Shared calendar, smart shopping lists sorted by Aussie supermarkets, weekend plans and family notes — all in one cosy dashboard.
          </p>

          <button
            data-testid="login-google-button"
            onClick={handleGoogleLogin}
            className="neo-btn bg-white text-gray-900 px-6 py-4 text-base inline-flex items-center gap-3 group"
          >
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="font-outfit font-bold">Continue with Google</span>
            <span className="text-sm font-normal text-gray-500 group-hover:text-gray-900">→</span>
          </button>

          <div className="flex flex-wrap gap-3 pt-4">
            {[
              { icon: CalendarIcon, label: 'Shared Calendar', bg: '#90DBF4' },
              { icon: ShoppingBag, label: 'Smart Shopping', bg: '#B9FBC0' },
              { icon: StickyNote, label: 'Family Notes', bg: '#FBF8CC' },
              { icon: Users, label: 'Kids & Parents', bg: '#FFD6BA' },
            ].map(({ icon: Icon, label, bg }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2 border-2 border-gray-900 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: bg }}
              >
                <Icon size={16} strokeWidth={2.5} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Right - Visual */}
        <div className="hidden md:block relative">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-[#E0C3FC] border-2 border-gray-900 rounded-full z-0" />
          <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-[#FFD6BA] border-2 border-gray-900 rounded-full z-0" />
          <div className="relative neo-card overflow-hidden z-10">
            <img
              src="https://images.pexels.com/photos/4260096/pexels-photo-4260096.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
              alt="Happy family"
              className="w-full h-[500px] object-cover"
            />
          </div>
          {/* Floating card */}
          <div className="absolute top-6 -left-6 neo-card bg-white p-4 max-w-[200px] z-20 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1">This weekend</div>
            <div className="font-outfit font-bold text-lg">Movie Night 🎬</div>
            <div className="text-xs text-gray-600">Saturday 7:00 PM</div>
          </div>
          <div className="absolute bottom-10 -right-4 neo-card bg-[#B9FBC0] p-4 max-w-[220px] z-20 animate-slide-up" style={{ animationDelay: '0.5s' }}>
            <div className="text-xs uppercase tracking-widest font-bold text-gray-700 mb-1">Coles List</div>
            <div className="font-outfit font-bold text-base">8 items ready</div>
            <div className="text-xs text-gray-700">Milk, Bread, Eggs...</div>
          </div>
        </div>
      </div>
    </div>
  );
}
