import AsyncStorage from "@react-native-async-storage/async-storage";
import { SELF_SERVICE_ACCOUNT_TYPES } from "./accountTypes";

const KEY = "glp-signup-intent";

// "Continue with Google" leaves the app entirely: a full-page redirect to
// Google and back. React state does not survive that, so the answers given
// before pressing it have to be parked somewhere durable and picked up on
// return.
//
// Short-lived on purpose. A round trip through Google takes seconds; anything
// older than this is an abandoned attempt, and applying a stale intent to
// whoever signs in next — a real risk on a shared or family computer, which is
// not unusual for this product — would silently make them a provider for an
// organization they have nothing to do with.
const MAX_AGE_MS = 15 * 60 * 1000;

const VALID_TYPES = SELF_SERVICE_ACCOUNT_TYPES.map((t) => t.id);

// Reading then removing from AsyncStorage is two operations, so two concurrent
// callers can both read the same entry before either removes it — and both then
// fire the claim, one of which fails. An in-memory latch closes that window,
// because there is only ever one OAuth return per page load to spend.
let spent = false;

/** Park the signup answers before handing off to Google. */
export async function saveSignupIntent({ accountType, orgId = null, orgName = null }) {
  spent = false;
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        accountType,
        orgId: orgId || null,
        orgName: orgName || null,
        at: Date.now(),
      })
    );
  } catch {
    // Storage being unavailable is not worth failing the signup over — the
    // user just gets asked the questions again after returning.
  }
}

/**
 * Read and consume the parked answers.
 *
 * Always clears, whether or not the value was usable, so a malformed or expired
 * entry cannot sit around being retried. Returns null unless the entry is fresh
 * and correctly shaped.
 *
 * The values are only ever a *request*: claim_account_type() re-checks the
 * account type against its own whitelist and verifies the organization exists,
 * and an organization claim still needs a platform admin to approve it. So a
 * hand-edited entry here cannot grant anything the signup form could not.
 */
export async function takeSignupIntent() {
  if (spent) return null;
  spent = true;

  let raw = null;
  try {
    raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  if (!VALID_TYPES.includes(parsed.accountType)) return null;
  if (typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) return null;

  const orgId = typeof parsed.orgId === "string" && parsed.orgId ? parsed.orgId : null;
  const orgName = typeof parsed.orgName === "string" && parsed.orgName ? parsed.orgName : null;

  // A provider with neither is incomplete; let the prompt ask properly.
  if (parsed.accountType === "provider" && !orgId && !orgName) return null;

  return { accountType: parsed.accountType, orgId, orgName };
}

export async function clearSignupIntent() {
  spent = true;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do — a leftover entry expires on its own.
  }
}
