import React, { useState, useMemo, useEffect } from 'react';
import { Bookmark as BookmarkIcon, Plus, Trash2, ExternalLink, Hash, Search, LogOut, User, CheckCircle2 } from 'lucide-react';
import { useBookmarks } from './hooks/useBookmarks';
import { useAuth } from './hooks/useAuth';
import { Bookmark } from './types';

const TAG_COLORS = [
  'bg-red-500 text-white',
  'bg-orange-500 text-white',
  'bg-amber-400 text-slate-900',
  'bg-green-500 text-white',
  'bg-emerald-400 text-slate-900',
  'bg-teal-500 text-white',
  'bg-cyan-400 text-slate-900',
  'bg-blue-500 text-white',
  'bg-indigo-500 text-white',
  'bg-violet-500 text-white',
  'bg-purple-500 text-white',
  'bg-fuchsia-500 text-white',
  'bg-pink-500 text-white',
  'bg-rose-500 text-white',
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function App() {
  const { token, username, isLoading: isAuthLoading, login, logout } = useAuth();
  const { bookmarks, addBookmark, deleteBookmark, isLoading: isBookmarksLoading } = useBookmarks(token);
  
  const [url, setUrl] = useState('');
  const [tag, setTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [toast, setToast] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({show: false, message: '', type: 'success'});

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      login(data.token, data.username);
      setAuthUsername('');
      setAuthPassword('');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      
      const authWindow = window.open(
        data.url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        setAuthError('Please allow popups for this site to sign in with Google.');
      }
    } catch (err) {
      setAuthError('Failed to initialize Google login');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin is from AI Studio preview or localhost
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        login(event.data.token, event.data.username);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [login]);

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const query = searchQuery.toLowerCase();
    return bookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.url.toLowerCase().includes(query) ||
        b.tag.toLowerCase().includes(query)
    );
  }, [bookmarks, searchQuery]);

  const groupedBookmarks = useMemo<Record<string, Bookmark[]>>(() => {
    const groups: Record<string, Bookmark[]> = {};
    filteredBookmarks.forEach((bookmark) => {
      if (!groups[bookmark.tag]) {
        groups[bookmark.tag] = [];
      }
      groups[bookmark.tag].push(bookmark);
    });
    
    // Sort tags alphabetically
    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = groups[key].sort((a, b) => b.createdAt - a.createdAt);
        return acc;
      }, {} as Record<string, Bookmark[]>);
  }, [filteredBookmarks]);

  const existingTags = useMemo(() => {
    const tags = new Set(bookmarks.map((b) => b.tag));
    return Array.from(tags).sort();
  }, [bookmarks]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#FDF8E1] flex items-center justify-center">
        <div className="w-12 h-12 border-8 border-yellow-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#FDF8E1] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-pink-200 selection:text-pink-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-orange-400 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(236,72,153,0.3)] transform -rotate-6">
              <BookmarkIcon size={32} strokeWidth={3} />
            </div>
          </div>
          <h2 className="mt-6 text-center text-4xl font-black text-slate-800 tracking-tight">
            {authMode === 'login' ? 'Welcome Back! 👋' : 'Join the Fun! 🚀'}
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-[0_20px_50px_rgb(0,0,0,0.05)] sm:rounded-[2rem] sm:px-10 border-4 border-white">
            <form className="space-y-6" onSubmit={handleAuth}>
              {authError && (
                <div className="bg-red-100 text-red-600 text-sm p-4 rounded-2xl font-bold">
                  {authError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 ml-2 mb-2">Username</label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    className="appearance-none block w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold placeholder-slate-400 focus:outline-none focus:border-pink-400 focus:bg-white transition-all sm:text-sm"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 ml-2 mb-2">Password</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    className="appearance-none block w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold placeholder-slate-400 focus:outline-none focus:border-pink-400 focus:bg-white transition-all sm:text-sm"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full flex justify-center py-3.5 px-4 border-0 rounded-2xl shadow-lg shadow-pink-500/30 text-base font-bold text-white bg-gradient-to-r from-pink-500 to-orange-400 hover:shadow-pink-500/50 hover:-translate-y-1 transition-all"
                >
                  {authMode === 'login' ? 'Let\'s Go!' : 'Sign Me Up!'}
                </button>
              </div>
            </form>

            <div className="mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t-2 border-slate-100" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-slate-400 font-bold">
                    OR
                  </span>
                </div>
              </div>

              <div className="mt-8">
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex justify-center items-center gap-3 py-3.5 px-4 border-2 border-slate-100 rounded-2xl shadow-sm text-base font-bold text-slate-700 bg-white hover:bg-slate-50 hover:-translate-y-1 transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>
              </div>
            </div>

            <div className="mt-8 text-center">
              <button
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
                className="text-pink-500 hover:text-pink-600 font-bold transition-colors"
              >
                {authMode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    await addBookmark(url, tag);
    setUrl('');
    setTag('');
    showToast('Bookmark added', 'success');
  };

  const handleDelete = async (id: string) => {
    await deleteBookmark(id);
    showToast('Bookmark deleted', 'error');
  };

  return (
    <div className="min-h-screen bg-[#FDF8E1] text-slate-800 font-sans selection:bg-pink-200 selection:text-pink-900 relative">
      <div className="max-w-5xl mx-auto px-6 py-12">
        
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-orange-400 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(236,72,153,0.3)] transform -rotate-6">
              <BookmarkIcon size={28} strokeWidth={3} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-800">Bookmarks</h1>
              <p className="text-sm text-slate-500 font-bold mt-0.5">Organize your favorite links</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-72">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search size={18} className="text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search bookmarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-full text-sm font-bold focus:outline-none focus:border-pink-400 transition-all placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="relative group">
                <div className="p-3 flex items-center justify-center bg-white rounded-full border-2 border-slate-100 shadow-sm text-slate-500 hover:text-pink-500 hover:border-pink-200 transition-all cursor-default">
                  <User size={20} strokeWidth={2.5} />
                </div>
                {/* Tooltip */}
                <div className="absolute right-0 top-full mt-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                  {username}
                  <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-800"></div>
                </div>
              </div>
              <div className="relative group">
                <button
                  onClick={logout}
                  className="p-3 text-slate-500 hover:text-red-500 hover:bg-red-50 bg-white rounded-full border-2 border-slate-100 shadow-sm transition-all"
                  aria-label="Sign out"
                >
                  <LogOut size={20} strokeWidth={2.5} />
                </button>
                {/* Tooltip */}
                <div className="absolute right-0 top-full mt-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                  Sign out
                  <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-800"></div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Add Bookmark Form */}
        <div className="bg-white rounded-[2rem] p-8 mb-12 shadow-[0_20px_50px_rgb(0,0,0,0.05)] border-4 border-white">
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label htmlFor="url" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-2">
                URL
              </label>
              <input
                id="url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-pink-400 focus:bg-white transition-all"
                required
              />
            </div>
            
            <div className="w-full md:w-64">
              <label htmlFor="tag" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-2">
                Tag
              </label>
              <input
                id="tag"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. Design, React"
                list="existing-tags"
                className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-pink-400 focus:bg-white transition-all"
              />
              <datalist id="existing-tags">
                {existingTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            
            <button
              type="submit"
              disabled={!url.trim()}
              className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 disabled:from-slate-300 disabled:to-slate-300 text-white text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 hover:-translate-y-1 disabled:shadow-none disabled:transform-none"
            >
              <Plus size={20} strokeWidth={3} />
              <span>Add Link</span>
            </button>
          </form>
        </div>

        {/* Bookmarks List */}
        {isBookmarksLoading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-8 border-yellow-200 border-t-pink-500 rounded-full animate-spin mx-auto mb-6"></div>
            <p className="text-slate-500 font-bold">Loading your links...</p>
          </div>
        ) : Object.keys(groupedBookmarks).length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[3rem] border-4 border-dashed border-slate-200">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 transform rotate-12">
              <BookmarkIcon size={32} className="text-yellow-500" strokeWidth={2.5} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">It's empty here!</h3>
            <p className="text-slate-500 font-bold">
              {searchQuery ? "No matches found for your search." : "Start adding some joyful links above."}
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {Object.entries(groupedBookmarks).map(([groupTag, groupBookmarks]: [string, Bookmark[]]) => (
              <section key={groupTag} className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="flex items-center gap-4 mb-8">
                  <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <span className="text-pink-400">#</span>
                    {groupTag}
                  </h2>
                  <div className="h-1 flex-1 bg-slate-200/60 rounded-full"></div>
                  <span className="text-sm font-bold text-slate-500 bg-white border-2 border-slate-100 px-3 py-1 rounded-full">
                    {groupBookmarks.length}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groupBookmarks.map((bookmark) => (
                    <div 
                      key={bookmark.id}
                      className="group relative bg-white rounded-[2rem] p-6 border-2 border-slate-100 hover:border-pink-400 hover:shadow-[0_20px_50px_rgb(236,72,153,0.15)] hover:-translate-y-2 transition-all duration-300"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${getTagColor(bookmark.tag)}`}>
                          {bookmark.tag}
                        </span>
                        
                        <button
                          onClick={() => handleDelete(bookmark.id)}
                          className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 transform hover:scale-110"
                          aria-label="Delete bookmark"
                        >
                          <Trash2 size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                      
                      <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-2 leading-tight" title={bookmark.title}>
                        {bookmark.title}
                      </h3>
                      
                      <a 
                        href={bookmark.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-slate-400 hover:text-pink-500 flex items-center gap-2 group/link transition-colors line-clamp-1"
                        title={bookmark.url}
                      >
                        <span className="truncate">{bookmark.url}</span>
                        <ExternalLink size={16} className="opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all" strokeWidth={2.5} />
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-8 right-8 bg-slate-900 text-white shadow-2xl rounded-full px-6 py-4 flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          {toast.type === 'success' ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 size={18} strokeWidth={3} className="text-white" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
              <Trash2 size={18} strokeWidth={3} className="text-white" />
            </div>
          )}
          <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
