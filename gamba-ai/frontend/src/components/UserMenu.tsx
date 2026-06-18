'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useState, useRef, useEffect } from 'react';

/**
 * UserMenu — Displays the logged-in user's initials in a circle avatar.
 * Clicking it opens a minimal dropdown with a logout button.
 */
export default function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!user) return null;

  const firstName = user.firstName || '';
  const lastName = user.lastName || '';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="
          flex items-center justify-center w-9 h-9 rounded-full
          bg-gradient-to-br from-blue-400 to-indigo-500
          text-white text-xs font-semibold tracking-wide
          shadow-[0_2px_12px_rgba(59,130,246,0.25)]
          hover:shadow-[0_2px_20px_rgba(59,130,246,0.35)]
          hover:scale-105
          transition-all duration-300 cursor-pointer select-none
          focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fc]
        "
        aria-label="User menu"
        aria-expanded={open}
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="
            absolute right-0 top-12 z-50
            min-w-[180px] py-2 px-1
            bg-white rounded-xl
            border border-black/[0.06]
            shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]
            animate-fade-in
          "
        >
          {/* User info */}
          <div className="px-3 py-2 border-b border-black/[0.05] mb-1">
            <p className="text-sm font-medium text-gray-800 truncate">
              {firstName} {lastName}
            </p>
            <p className="text-[11px] text-gray-400 truncate">
              {user.primaryEmailAddress?.emailAddress || ''}
            </p>
          </div>

          {/* Sign out button */}
          <button
            onClick={() => signOut()}
            className="
              w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
              text-sm text-gray-500 hover:text-red-500
              hover:bg-red-50/80
              transition-all duration-200 cursor-pointer
              text-left
            "
          >
            {/* Logout icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
