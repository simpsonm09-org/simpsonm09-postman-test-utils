/** Decodes a `text/event-stream` body into validated SSE events. */

/** One decoded SSE event. `data` is the parsed JSON payload when valid. */
export interface ScenarioSseEvent {
  name: string;
  id?: string;
  retry?: number;
  data: unknown;
  dataText: string;
  dataParseError: boolean;
}

export function normalizeContentType(value: any): string {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function decodeScenarioSse(rawText: any): ScenarioSseEvent[] {
  const lines = String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const events: ScenarioSseEvent[] = [];
  let frame: string[] = [];

  const dispatch = () => {
    if (isSkippableFrame(frame)) {
      frame = [];
      return;
    }

    events.push(compileScenarioSseEvent(frame));
    frame = [];
  };

  lines.forEach((line) => {
    if (line === "") {
      dispatch();
    } else {
      frame.push(line);
    }
  });
  dispatch();

  return events;
}

export function isSkippableFrame(frame: string[]): boolean {
  return frame.every((line) => line.startsWith(":"));
}

export function compileScenarioSseEvent(frame: string[]): ScenarioSseEvent {
  const parsed: {
    eventName?: string;
    id?: string;
    retry?: number;
    dataLines: string[];
  } = { dataLines: [] };

  frame.forEach((line) => {
    applyScenarioSseLine(line, parsed);
  });

  const dataText = parsed.dataLines.join("\n");
  let data: any;
  let dataParseError = false;

  if (parsed.dataLines.length === 0) {
    dataParseError = true;
  } else {
    try {
      data = JSON.parse(dataText);
    } catch {
      dataParseError = true;
    }
  }

  return {
    name: parsed.eventName === undefined ? "message" : parsed.eventName,
    id: parsed.id,
    retry: parsed.retry,
    data,
    dataText,
    dataParseError,
  };
}

export function applyScenarioSseLine(
  line: string,
  parsed: {
    eventName?: string;
    id?: string;
    retry?: number;
    dataLines: string[];
  },
): void {
  if (line.startsWith(":")) {
    return;
  }

  const { field, value } = parseScenarioSseField(line);

  if (field === "event") {
    parsed.eventName = value;
  } else if (field === "id") {
    parsed.id = value;
  } else if (field === "retry") {
    applyScenarioRetry(value, parsed);
  } else if (field === "data") {
    parsed.dataLines.push(value);
  }
}

export function parseScenarioSseField(line: string): {
  field: string;
  value: string;
} {
  const colon = line.indexOf(":");
  const field = colon < 0 ? line : line.slice(0, colon);
  const rawValue = colon < 0 ? "" : line.slice(colon + 1);
  const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
  return { field, value };
}

export function applyScenarioRetry(
  value: string,
  parsed: { retry?: number },
): void {
  if (/^\d+$/.test(value)) {
    parsed.retry = Number(value);
  }
}
