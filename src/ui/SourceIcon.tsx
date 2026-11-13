import { BookOpen, FileText, MonitorPlay, TvMinimalPlay } from 'lucide-react';
import type { SourceKind } from '@/lib/types';

export function SourceIcon({ source, className }: { source: SourceKind; className?: string }) {
  if (source === 'youtube') return <TvMinimalPlay className={className} />;
  if (source === 'ttsu' || source === 'yatsu') return <BookOpen className={className} />;
  if (source === 'article') return <FileText className={className} />;
  return <MonitorPlay className={className} />;
}
