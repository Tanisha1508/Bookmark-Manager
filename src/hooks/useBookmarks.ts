import { useState, useEffect } from 'react';
import { Bookmark } from '../types';

export function useBookmarks(token: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setBookmarks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch('/api/bookmarks', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        setBookmarks(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch bookmarks', err);
        setIsLoading(false);
      });
  }, [token]);

  const addBookmark = async (urlInput: string, tagInput: string) => {
    if (!token) return;

    let url = urlInput.trim();
    let title = url;
    
    // Auto-prepend https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const parsedUrl = new URL(url);
      title = parsedUrl.hostname.replace(/^www\./, '');
    } catch (e) {
      // Invalid URL format, fallback to the original input
      title = urlInput.trim();
    }

    const tag = tagInput.trim() || 'Uncategorized';

    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url, title, tag }),
      });
      if (res.ok) {
        const newBookmark = await res.json();
        setBookmarks((prev) => [newBookmark, ...prev]);
      }
    } catch (err) {
      console.error('Failed to add bookmark', err);
    }
  };

  const deleteBookmark = async (id: string) => {
    if (!token) return;

    // Optimistic update
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    try {
      await fetch(`/api/bookmarks/${id}`, { 
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Failed to delete bookmark', err);
    }
  };

  return { bookmarks, addBookmark, deleteBookmark, isLoading };
}
