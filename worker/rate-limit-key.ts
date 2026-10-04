const HEX_GROUP = /^[0-9a-f]{1,4}$/;
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

// One rate-limit bucket per client. An IPv6 home or mobile connection
// usually controls a whole /64, so key IPv6 by that prefix; otherwise a
// client could rotate addresses for a fresh bucket each time.
export function rateLimitKey(ip: string | null): string {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;

  const address = ip.split("%")[0].toLowerCase(); // drop a zone id like %eth0
  const mapped = MAPPED_IPV4.exec(address);
  if (mapped) return mapped[1];

  const halves = address.split("::");
  if (halves.length > 2) return ip;

  const head = halves[0] ? halves[0].split(":") : [];
  let groups = head;
  if (halves.length === 2) {
    const tail = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return ip;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }

  const prefix = groups.slice(0, 4);
  if (prefix.length < 4 || !prefix.every((g) => HEX_GROUP.test(g))) return ip;
  return `${prefix.map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}
