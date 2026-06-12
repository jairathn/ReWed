/**
 * SMS segment math, shared by the composer UI (live counter) and anyone who
 * wants to estimate cost. Twilio bills per segment, not per message:
 *
 *   GSM-7 text:  160 chars in one segment, 153/segment when concatenated.
 *   Any char outside GSM-7 (emoji, curly quotes, most non-Latin scripts)
 *   forces UCS-2: 70 chars single, 67/segment concatenated, counted in
 *   UTF-16 code units (an emoji is 2).
 *
 * GSM-7 extended chars (^ { } \ [ ] ~ | €) fit in GSM-7 but cost 2 chars.
 */

const GSM7_BASIC =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]$/;
const GSM7_EXTENDED = /^[\^{}\\[\]~|€]$/;

export interface SegmentInfo {
  encoding: 'GSM-7' | 'UCS-2';
  /** Billable length (GSM-7 septets or UTF-16 code units). */
  length: number;
  segments: number;
}

export function countSegments(text: string): SegmentInfo {
  let gsmLength = 0;
  let isGsm = true;

  for (const ch of text) {
    if (GSM7_BASIC.test(ch)) gsmLength += 1;
    else if (GSM7_EXTENDED.test(ch)) gsmLength += 2;
    else {
      isGsm = false;
      break;
    }
  }

  if (isGsm) {
    return {
      encoding: 'GSM-7',
      length: gsmLength,
      segments: gsmLength === 0 ? 0 : gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153),
    };
  }

  const units = text.length; // UTF-16 code units, matching Twilio's count
  return {
    encoding: 'UCS-2',
    length: units,
    segments: units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67),
  };
}
