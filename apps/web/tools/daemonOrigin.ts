/**
 * The Origin the dev proxy sends to the daemon. The daemon compares Origin with the panel
 * address, so a request from the panel itself is presented as one from the daemon's origin.
 * A foreign Origin passes untouched and the daemon refuses it: rewriting every request would
 * let any page in the developer's browser send mutating requests through the dev server.
 */
export function daemonOriginFor(
  incomingOrigin: string | undefined,
  devServerHost: string | undefined,
  daemonTarget: string
): string | undefined {
  if (incomingOrigin === undefined || incomingOrigin === '') {
    return daemonTarget;
  }

  try {
    return new URL(incomingOrigin).host === devServerHost ? daemonTarget : undefined;
  } catch {
    return undefined;
  }
}
