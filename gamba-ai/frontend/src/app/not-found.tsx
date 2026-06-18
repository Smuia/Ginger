"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(5);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 1. Countdown interval (updates UI count every second)
    countdownIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 2. Redirect timeout (triggers navigation after 5 seconds)
    redirectTimerRef.current = setTimeout(() => {
      router.push("/");
    }, 5000);

    // Cleanup on component unmount
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-dvh w-full px-6 relative z-10 select-none">
      {/* Dynamic Background Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-gamba-navy/[0.03] blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-gamba-gold/[0.02] blur-3xl -z-10 pointer-events-none" />

      {/* Main Content Card */}
      <div className="flex flex-col items-center max-w-md w-full animate-fade-in">
        
        {/* Brand Logo Container with interactive animations */}
        <div className="relative flex items-center justify-center p-6 mb-8 rounded-3xl bg-white/40 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_0_rgba(0,43,73,0.03)] hover:shadow-[0_8px_32px_0_rgba(184,150,12,0.06)] hover:border-gamba-gold/10 transition-all duration-500 group">
          {/* Pulsing Gold Halo Ring */}
          <div className="absolute inset-0 rounded-3xl border border-gamba-gold/0 group-hover:border-gamba-gold/30 group-hover:scale-105 transition-all duration-700 pointer-events-none" />
          
          <div className="animate-float">
            <Image
              src="/logo.webp"
              alt="Gamba AI Logo"
              width={110}
              height={66}
              className="object-contain filter drop-shadow-[0_4px_8px_rgba(0,43,73,0.08)] group-hover:drop-shadow-[0_4px_12px_rgba(184,150,12,0.15)] group-hover:scale-105 transition-all duration-500"
              priority
            />
          </div>
        </div>

        {/* 404 Header Text */}
        <h1 className="text-6xl font-extrabold tracking-tighter text-gamba-navy mb-2 relative">
          404
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-gamba-navy to-gamba-gold rounded-full" />
        </h1>
        
        <h2 className="text-xl font-bold text-gamba-navy-deep mt-4 mb-2">
          Page Not Found
        </h2>
        
        <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-sm">
          The requested resource is missing, or the path was entered incorrectly. Speak to the homepage interface to start again.
        </p>

        {/* Countdown Visual Indicator Card */}
        <div className="w-full bg-white/50 backdrop-blur-sm border border-black/[0.04] rounded-2xl p-4 mb-8 shadow-sm flex flex-col items-center relative overflow-hidden">
          <p className="text-xs font-semibold text-gamba-navy/70 tracking-wide uppercase mb-2">
            Auto-Redirecting to Home in
          </p>
          <span className="text-3xl font-extrabold text-gamba-gold tabular-nums transition-all duration-300 scale-100 hover:scale-110">
            {timeLeft}s
          </span>

          {/* Smooth Depleting Progress Bar */}
          <div className="w-full h-1 bg-black/[0.05] rounded-full mt-3 overflow-hidden relative">
            <div 
              className="h-full bg-gradient-to-r from-gamba-navy to-gamba-gold transition-all duration-1000 ease-linear"
              style={{ width: `${(timeLeft / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Action Button */}
        <Link 
          href="/"
          className="
            flex items-center justify-center gap-2 px-6 py-3 rounded-full
            bg-gamba-navy hover:bg-gamba-navy-deep text-white text-sm font-semibold
            shadow-[0_4px_16px_rgba(0,43,73,0.18)]
            hover:shadow-[0_6px_22px_rgba(0,43,73,0.28)]
            transform hover:-translate-y-0.5 hover:scale-105 active:scale-98
            transition-all duration-300 cursor-pointer select-none
          "
        >
          {/* Back Home Arrow Icon */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 20 20" 
            fill="currentColor" 
            className="w-4 h-4"
          >
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Homepage
        </Link>

      </div>
    </div>
  );
}
