import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';

export default function Navigation({ user }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#FDFBF7]/80 border-b-2 border-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3" data-testid="nav-brand">
          <div className="w-10 h-10 bg-[#B9FBC0] border-2 border-gray-900 rounded-lg flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]">
            <Home size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-outfit font-extrabold text-lg leading-none tracking-tight">Nest</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Family Organiser</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full border border-gray-300" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#90DBF4] flex items-center justify-center text-xs font-bold">
                {user.name?.[0] || 'U'}
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900" data-testid="nav-user-name">{user.name}</span>
          </div>
          <button
            data-testid="nav-logout-btn"
            onClick={handleLogout}
            className="neo-btn bg-white text-gray-900 px-3 py-2 inline-flex items-center gap-2 text-sm"
            title="Log out"
          >
            <LogOut size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
