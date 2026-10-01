/**
 * The Twilio Voice client identity for a consultant, and its inverse.
 *
 * The browser registers as `consultant_<memberId>`; when it places a call, Twilio posts
 * `From=client:consultant_<memberId>` to the TwiML webhook. The webhook maps that back to a
 * member id and checks it owns the call — so the identity format is a security boundary and
 * is parsed strictly (exact prefix, canonical UUID, nothing else).
 */

const PREFIX = "consultant_";
const CLIENT_SCHEME = "client:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function voiceIdentity(memberId: string): string {
  const id = memberId.trim().toLowerCase();
  if (!UUID.test(id)) throw new Error("voiceIdentity: memberId must be a UUID");
  return `${PREFIX}${id}`;
}

/** `consultant_<uuid>` or `client:consultant_<uuid>` → lower-case uuid; anything else → null. */
export function memberIdFromIdentity(identity: string): string | null {
  if (typeof identity !== "string") return null;
  const bare = identity.startsWith(CLIENT_SCHEME) ? identity.slice(CLIENT_SCHEME.length) : identity;
  if (!bare.startsWith(PREFIX)) return null;
  const id = bare.slice(PREFIX.length);
  return UUID.test(id) ? id.toLowerCase() : null;
}
