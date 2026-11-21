export const ARABIC_HINTS = {
  done: 'تم',
  later: 'بعدين',
  roughDay: 'يوم صعب؟ خفّفه',
  dayDone: 'خلصت يومي',
  gymDay: 'يوم جيم',
  mmaDay: 'تمرين MMA',
  sparringDay: 'سبارينج تقيل',
  restDay: 'يوم راحة',
  confirmRight: 'تمام، صح',
  dailyLineNote: 'خطوة هادية النهارده أفضل من الكمال.',
  windDown: 'تقفيل اليوم في دقيقتين',
  outToday: 'طالع بره النهارده',
  skipDontTrack: 'تخطي، بلاش تسجيل',
  sameAsUsual: 'زي المعتاد',
  eventDayNote: 'يوم مناسبة — استمتع وبكره يوم عادي',
  estimateWord: 'تقدير تقريبي',
  howWasEating: 'الأكل كان إيه النهارده؟',
} as const;

const ARABIC_INDIC_MAP = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function formatDisplayNumber(
  value: number | string,
  useArabicIndic?: boolean
): string {
  const str = String(value);
  if (!useArabicIndic) return str;
  return str.replace(/\d/g, (d) => ARABIC_INDIC_MAP[Number(d)] ?? d);
}
