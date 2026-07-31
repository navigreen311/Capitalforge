// ============================================================
// CapitalForge — Recipient timezone resolution
//
// Quiet-hours rules are stated in the recipient's local time, so outreach has
// to know it. Three sources, in descending order of reliability:
//
//   1. Business.timezone           — explicit, and the only one that can be
//                                    correct for a client who has moved
//   2. the destination area code   — the number being dialled is itself
//                                    evidence of where it rings
//   3. nothing                     — the caller must refuse to send
//
// There is deliberately no default. A guess that lands on the wrong side of
// the window is a message delivered at 3am, which is the violation the window
// exists to prevent.
// ============================================================

const IANA_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
  'America/Halifax',
  'America/St_Johns',
  'America/Toronto',
  'America/Winnipeg',
  'America/Edmonton',
  'America/Vancouver',
] as const;

export type KnownZone = (typeof IANA_ZONES)[number];

/**
 * NANP area code → IANA zone.
 *
 * Area codes that straddle a timezone boundary are assigned to the zone
 * holding most of their population; those cases are noted where they occur.
 * Codes absent from this table resolve to null rather than to a neighbour.
 */
const AREA_CODE_ZONES: Record<string, KnownZone> = {};

function assign(zone: KnownZone, codes: string[]): void {
  for (const code of codes) AREA_CODE_ZONES[code] = zone;
}

// ── Eastern ──────────────────────────────────────────────────
assign('America/New_York', [
  '201','202','203','207','212','215','216','220','223','227','229','234','240','272','276','301','302','304','305','315','321','326','330','332','336','339','347','351','352','353','363','380','386','404','407','410','412','413','419','423','434','440','443','445','448','464','469','470','475','478','484','504','508','513','516','517','518','561','567','570','571','585','586','601','603','607','609','610','612','614','616','617','626','628','631','636','646','667','670','678','681','686','689','703','704','705','706','707','716','717','718','724','727','729','732','734','737','740','743','754','757','762','770','772','774','781','786','803','804','810','813','814','828','838','839','843','845','848','850','856','857','859','860','862','863','864','865','878','904','908','910','912','914','917','919','929','934','937','939','941','947','954','959','973','980','984','989',
]);

// ── Central ──────────────────────────────────────────────────
assign('America/Chicago', [
  '205','210','214','217','218','219','224','225','251','254','256','260','262','270','281','309','312','314','316','317','318','319','320','325','331','334','337','346','361','364','369','405','406','409','414','417','430','432','440','447','456','458','463','469','479','501','502','504','507','512','515','563','573','574','580','582','601','608','612','615','618','620','630','636','641','651','657','660','662','678','682','701','708','712','713','715','726','731','737','763','769','773','779','785','806','812','815','816','817','830','832','847','850','870','872','901','903','913','915','918','920','931','936','940','945','952','956','972','979','985',
]);

// ── Mountain ─────────────────────────────────────────────────
assign('America/Denver', ['303','307','308','385','406','435','505','575','719','720','801','915','970','983','986']);

// Arizona does not observe daylight saving, so it needs its own zone.
assign('America/Phoenix', ['480','520','602','623','928']);

// ── Pacific ──────────────────────────────────────────────────
assign('America/Los_Angeles', [
  '206','209','213','253','279','310','323','341','350','360','408','415','424','425','442','458','503','509','510','530','541','559','562','619','626','627','628','650','657','661','669','702','707','714','725','747','760','775','805','818','820','831','838','840','858','909','916','925','949','951','971',
]);

// ── Alaska, Hawaii, territories ──────────────────────────────
assign('America/Anchorage', ['907']);
assign('Pacific/Honolulu', ['808']);
assign('America/Puerto_Rico', ['787','939','340']);

// ── Canada ───────────────────────────────────────────────────
assign('America/Toronto', ['226','249','289','343','365','382','416','437','438','450','468','514','519','548','579','581','587','613','647','683','705','742','753','807','819','873','905','942']);
assign('America/Halifax', ['506','782','902']);
assign('America/St_Johns', ['709']);
assign('America/Winnipeg', ['204','431','639','306','474']);
assign('America/Edmonton', ['403','587','780','825','867']);
assign('America/Vancouver', ['236','250','604','672','778']);

/**
 * Timezone implied by an E.164 North American number.
 *
 * Returns null for anything outside the NANP: a country code alone does not
 * identify a timezone for countries that span several.
 */
export function zoneFromPhone(e164: string | null | undefined): KnownZone | null {
  if (!e164 || !e164.startsWith('+1')) return null;
  const areaCode = e164.slice(2, 5);
  return AREA_CODE_ZONES[areaCode] ?? null;
}

/** Whether a string is a timezone this runtime can actually resolve. */
export function isValidTimezone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export type TimezoneSource = 'business' | 'area_code' | 'none';

export interface ResolvedTimezone {
  zone: string | null;
  source: TimezoneSource;
}

/**
 * Resolve the timezone to judge quiet hours in.
 *
 * An invalid stored value falls through to the area code rather than throwing
 * — a typo in one client's record should not stop a campaign, but it must not
 * be trusted either.
 */
export function resolveTimezone(
  storedTimezone: string | null | undefined,
  e164Phone: string | null | undefined,
): ResolvedTimezone {
  if (isValidTimezone(storedTimezone)) {
    return { zone: storedTimezone as string, source: 'business' };
  }

  const fromPhone = zoneFromPhone(e164Phone);
  if (fromPhone) return { zone: fromPhone, source: 'area_code' };

  return { zone: null, source: 'none' };
}

/**
 * The hour of day at `instant` in `zone`, 0–23.
 *
 * Uses Intl rather than a fixed offset so daylight saving is handled: a fixed
 * offset is wrong for half the year, and being an hour out at either edge of
 * the window is exactly the error that matters.
 */
export function hourInZone(instant: Date, zone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hour12: false,
  }).format(instant);

  // 'en-US' with hour12:false renders midnight as '24' in some runtimes.
  const hour = Number.parseInt(formatted, 10);
  return hour === 24 ? 0 : hour;
}
