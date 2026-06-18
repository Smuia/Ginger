import AudioInterface from "@/components/AudioInterface";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className='relative flex flex-col items-center justify-center flex-1 min-h-0 overflow-hidden z-10 px-4 py-6 md:py-10'>
      {/* Header — Brand */}
      <header className='flex items-center justify-center pt-2 pb-1'>
        <h1
          className='
            text-2xl md:text-3xl font-light tracking-[0.35em] uppercase
            text-transparent bg-clip-text
            bg-gradient-to-b from-[#002B49] to-[#5a8aad]
            select-none animate-float
          '>
          Gamba
        </h1>
      </header>

      {/* Subtle divider */}
      <div className='w-12 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent mb-2' />

      {/* Core Voice Interface (includes footer tagline) */}
      <AudioInterface />
    </main>
  );
}
