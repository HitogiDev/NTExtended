import type { LogType } from '@/lib/types';

// Keep these values aligned with NihongoTracker Frontend/src/constants/mediaColors.ts.
// Tailwind needs literal class names, so do not build them at runtime.
export const MEDIA_TYPE_CLASSES: Record<LogType, { text: string; bg: string; border: string }> = {
  vn: { text: 'text-[#3a70e4]', bg: 'bg-[#3a70e4]/10', border: 'border-[#3a70e4]/30' },
  anime: { text: 'text-[#26b2f2]', bg: 'bg-[#26b2f2]/10', border: 'border-[#26b2f2]/30' },
  video: { text: 'text-[#2cc9a4]', bg: 'bg-[#2cc9a4]/10', border: 'border-[#2cc9a4]/30' },
  'tv show': { text: 'text-[#f8b420]', bg: 'bg-[#f8b420]/10', border: 'border-[#f8b420]/30' },
  manga: { text: 'text-[#ee4466]', bg: 'bg-[#ee4466]/10', border: 'border-[#ee4466]/30' },
  'light-novel': { text: 'text-[#b34ce6]', bg: 'bg-[#b34ce6]/10', border: 'border-[#b34ce6]/30' },
  reading: { text: 'text-[#ec4899]', bg: 'bg-[#ec4899]/10', border: 'border-[#ec4899]/30' },
  movie: { text: 'text-[#f77118]', bg: 'bg-[#f77118]/10', border: 'border-[#f77118]/30' },
  audio: { text: 'text-[#f2a15a]', bg: 'bg-[#f2a15a]/10', border: 'border-[#f2a15a]/30' },
  other: { text: 'text-[#6b7280]', bg: 'bg-[#6b7280]/10', border: 'border-[#6b7280]/30' },
};
