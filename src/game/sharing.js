export const PUBLIC_GAME_URL = "https://headlost.github.io/flight-over-the-world/";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function roomInvitationLink(currentHref, roomId) {
  const current = new URL(currentHref);
  const base = current.protocol === "file:" || LOOPBACK_HOSTS.has(current.hostname)
    ? new URL(PUBLIC_GAME_URL)
    : current;
  base.search = "";
  base.hash = `r=${encodeURIComponent(String(roomId || ""))}`;
  return base.toString();
}

export function invitationText(link) {
  return `Join my Flight Over the World multiplayer room: ${link}`;
}

export function webSharePayload(link) {
  return {
    title: "Flight Over the World multiplayer room",
    text: "Join my multiplayer room.",
    url: link,
  };
}

export function shareDestination(target, link) {
  const invite = invitationText(link);
  const encodedInvite = encodeURIComponent(invite);
  const encodedLink = encodeURIComponent(link);
  const encodedTitle = encodeURIComponent("Flight Over the World multiplayer invitation");
  switch (target) {
    case "whatsapp": return `https://wa.me/?text=${encodedInvite}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`;
    case "telegram": return `https://t.me/share/url?url=${encodedLink}&text=${encodeURIComponent("Join my Flight Over the World multiplayer room")}`;
    case "email": return `mailto:?subject=${encodedTitle}&body=${encodedInvite}`;
    case "sms": return `sms:?body=${encodedInvite}`;
    default: return "";
  }
}
