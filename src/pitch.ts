// Pitch accent (Tokyo dialect) from Kanjium: where in a word the pitch falls.

let pitch: Record<string, number[]> | null = null;

/** Loads the accents once (about 200 KB), the first time a word page or answer needs them. */
export async function loadPitch(): Promise<Record<string, number[]>> {
  pitch ??= (await import("../data/pitch.json")).default as unknown as Record<string, number[]>;
  return pitch;
}

export function pitchLoaded(): Record<string, number[]> | null {
  return pitch;
}

/** Splits kana into morae: small ゃゅょ and the like join the kana before them; っ, ん and ー count on their own. */
export function morae(kana: string): string[] {
  const out: string[] = [];
  for (const c of kana) {
    if (/[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/.test(c) && out.length) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

/**
 * High or low for each mora, plus the particle after the word. Downstep 0 (heiban) rises and stays up;
 * 1 (atamadaka) starts high and falls; otherwise it rises after the first mora and falls after mora n.
 */
export function pattern(downstep: number, count: number): boolean[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    if (downstep === 0) return i > 0;
    if (downstep === 1) return i === 0;
    return i > 0 && i < downstep;
  });
}

export function patternName(downstep: number, count: number): string {
  if (downstep === 0) return "heiban";
  if (downstep === 1) return "atamadaka";
  return downstep >= count ? "odaka" : "nakadaka";
}
