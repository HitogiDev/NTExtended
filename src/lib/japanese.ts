// Keep this rule aligned with countJapaneseCharacters in NihongoTracker HookerScreen.tsx.
const JAPANESE_CHAR_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

export function countJapaneseCharacters(value: string): number {
  return (value.match(JAPANESE_CHAR_REGEX) ?? []).length;
}

const KANA_REGEX = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;

/** Count kana only. Chinese text also has Han characters, but no kana. */
export function countKana(value: string): number {
  return (value.match(KANA_REGEX) ?? []).length;
}

/** Japanese text has kana. A short value such as a title needs only a few. */
export function looksJapanese(value: string, minKana = 2): boolean {
  return countKana(value) >= minKana;
}

/** Minimum kana in a page or book sample before it counts as Japanese text. */
export const PAGE_MIN_KANA = 30;
