// Keep this rule aligned with countJapaneseCharacters in NihongoTracker HookerScreen.tsx.
const JAPANESE_CHAR_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

export function countJapaneseCharacters(value: string): number {
  return (value.match(JAPANESE_CHAR_REGEX) ?? []).length;
}
