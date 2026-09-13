const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"]);

export function createClipId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseTimestamp(value, fieldName = "Timestamp") {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) {
      return Number(value.toFixed(3));
    }

    throw new Error(`${fieldName} must be zero or greater.`);
  }

  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return parseTimestamp(Number(text), fieldName);
  }

  const parts = text.split(":");

  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) {
    throw new Error(`${fieldName} must look like 0:08, 1:02:14, or a number of seconds.`);
  }

  const numbers = parts.map(Number);
  const secondsPart = numbers[numbers.length - 1];

  if (secondsPart >= 60) {
    throw new Error(`${fieldName} seconds must be less than 60.`);
  }

  if (parts.length === 2 && numbers[0] >= 60) {
    return parseTimestamp(numbers[0] * 60 + secondsPart, fieldName);
  }

  if (parts.length === 3 && numbers[1] >= 60) {
    throw new Error(`${fieldName} minutes must be less than 60 when hours are included.`);
  }

  const totalSeconds = parts.length === 2
    ? numbers[0] * 60 + numbers[1]
    : numbers[0] * 3600 + numbers[1] * 60 + numbers[2];

  return parseTimestamp(totalSeconds, fieldName);
}

export function formatTimestamp(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const rounded = Math.round(seconds * 1000) / 1000;
  const wholeSeconds = Math.floor(rounded);
  const secondValue = wholeSeconds % 60;
  const minuteValue = Math.floor(wholeSeconds / 60) % 60;
  const hourValue = Math.floor(wholeSeconds / 3600);
  const secondText = String(secondValue).padStart(2, "0");
  const fractionText = (rounded - wholeSeconds).toFixed(3).slice(2).replace(/0+$/, "");
  const fractionSuffix = fractionText ? `.${fractionText}` : "";

  if (hourValue > 0) {
    return `${hourValue}:${String(minuteValue).padStart(2, "0")}:${secondText}${fractionSuffix}`;
  }

  return `${minuteValue}:${secondText}${fractionSuffix}`;
}

export function parseYouTubeOffset(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim().toLowerCase();

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }

  const parts = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);

  if (parts && (parts[1] || parts[2] || parts[3])) {
    return Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  }

  try {
    return parseTimestamp(text, "YouTube start time");
  } catch {
    return null;
  }
}

export function parseYouTubeUrl(rawUrl) {
  const text = String(rawUrl ?? "").trim();

  if (!text) {
    throw new Error("A YouTube URL is required.");
  }

  let url;

  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error("Enter a valid YouTube URL.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";

  if (!YOUTUBE_HOSTS.has(host)) {
    throw new Error("The URL must point to YouTube.");
  }

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v") || "";
  } else {
    const pathParts = url.pathname.split("/").filter(Boolean);
    const supportedPath = new Set(["embed", "shorts", "live", "v"]);

    if (supportedPath.has(pathParts[0])) {
      videoId = pathParts[1] || "";
    }
  }

  if (!VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("That URL does not contain a valid YouTube video ID.");
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    suggestedStart: parseYouTubeOffset(url.searchParams.get("t") || url.searchParams.get("start")),
  };
}

export function validateClipDraft(draft, existingId = null) {
  const title = String(draft.title ?? "").trim();

  if (!title) {
    throw new Error("Give the clip a title.");
  }

  if (title.length > 80) {
    throw new Error("Clip titles must be 80 characters or fewer.");
  }

  const parsedUrl = parseYouTubeUrl(draft.url ?? draft.sourceUrl ?? `https://www.youtube.com/watch?v=${draft.videoId ?? ""}`);
  const start = parseTimestamp(draft.start ?? draft.startSeconds ?? 0, "Start time");
  const end = parseTimestamp(draft.end ?? draft.endSeconds, "End time");

  if (end <= start) {
    throw new Error("End time must be after start time.");
  }

  const order = Number.isFinite(Number(draft.order)) ? Number(draft.order) : 0;
  const clipId = existingId || draft.id || createClipId();

  return {
    id: String(clipId),
    title,
    videoId: parsedUrl.videoId,
    start,
    end,
    order,
  };
}

export function normalizeClip(rawClip, fallbackOrder = 0) {
  return validateClipDraft(
    {
      ...rawClip,
      url: rawClip.url || rawClip.sourceUrl || `https://www.youtube.com/watch?v=${rawClip.videoId || ""}`,
      order: rawClip.order ?? fallbackOrder,
    },
    rawClip.id || null,
  );
}