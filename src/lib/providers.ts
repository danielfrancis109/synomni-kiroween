import { validateLocalUrl } from "./security";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompleteOpts {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface Provider {
  complete(messages: Message[], opts: CompleteOpts): Promise<string>;
}

export type ProviderId = "demo" | "anthropic" | "openai" | "xai" | "local";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ProviderTimeoutError extends Error {
  code = "PROVIDER_TIMEOUT";
  constructor() {
    super("Provider timeout");
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderHTTPError extends Error {
  code: string;
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderHTTPError";
    this.status = status;
    this.code = `HTTP_${status}`;
  }
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpStatus(status: number): ProviderHTTPError {
  switch (status) {
    case 401:
      return new ProviderHTTPError(401, "Invalid or missing API key");
    case 429:
      return new ProviderHTTPError(429, "Rate limit exceeded");
    case 500:
      return new ProviderHTTPError(500, "Provider internal server error");
    case 503:
      return new ProviderHTTPError(503, "Provider service unavailable");
    default:
      return new ProviderHTTPError(status, `Provider returned HTTP ${status}`);
  }
}

// ---------------------------------------------------------------------------
// Demo provider — deterministic, no network
// ---------------------------------------------------------------------------

// Stopwords removed before keyword extraction
const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall","must",
  "can","need","dare","ought","used","to","of","in","for","on","with","at","by",
  "from","up","about","into","through","during","before","after","above","below",
  "between","out","off","over","under","again","further","then","once","and","but",
  "or","nor","so","yet","both","either","neither","not","no","it","its","this",
  "that","these","those","i","you","he","she","we","they","what","which","who",
  "whom","how","when","where","why","all","each","every","few","more","most","other",
  "some","such","only","own","same","than","too","very","just","s","t","re","ll",
  "d","m","ve","isn","aren","wasn","weren","hasn","haven","hadn","won","don",
  "doesn","didn","couldn","wouldn","shouldn","also","there","here",
  "explain","describe","tell","give","list","write","show","please","briefly",
  "make","think","know","want","like","really","thing","things","get",
]);

/** Extract up to `n` meaningful keywords from text. */
function extractKeywords(text: string, n = 3): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); unique.push(w); }
  }
  return unique.slice(0, n);
}

/** Deterministic hash of a string — always non-negative. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0; // unsigned 32-bit, always non-negative
}

// ---------------------------------------------------------------------------
// Persona template banks (3–4 sentences each)
// ---------------------------------------------------------------------------

type TemplateEntry = { body: string };

const GENERALIST_TEMPLATES: TemplateEntry[] = [
  { body: "The core idea here is that {kw0} and {kw1} are closely linked. Breaking the problem into smaller pieces usually reveals a clean solution. When you map the relationships carefully, a natural answer emerges. Practical iteration refines the result further." },
  { body: "Thinking about {kw0} from first principles is the most reliable approach. Each step builds on the last, so precision early on pays dividends later. The connection between {kw1} and the broader context is worth exploring. A clear mental model saves more time than any shortcut." },
  { body: "There is a useful tension between {kw0} and simplicity that most people overlook. The best frameworks treat {kw1} as a constraint, not an afterthought. Working through examples exposes hidden assumptions quickly. Clarity of purpose is the real driver of good outcomes." },
  { body: "Approaching {kw0} systematically separates good solutions from great ones. The relationship with {kw1} is often the crux of the difficulty. Small, testable changes make progress visible and reversible. That discipline compounds into robust results over time." },
];

const SCIENTIST_TEMPLATES: TemplateEntry[] = [
  { body: "The experimental data on {kw0} shows a consistent pattern across replications. Controlling for {kw1} as a confounding variable is essential before drawing causal conclusions. The effect size is statistically significant (p < 0.05) but the practical magnitude depends on context. Further replication under varied conditions would strengthen these findings." },
  { body: "Peer-reviewed literature on {kw0} converges on three key mechanisms. The interaction with {kw1} at the molecular or systemic level introduces the main complexity. Isolating variables one at a time is the only way to attribute effects cleanly. Null results deserve the same scrutiny as positive ones." },
  { body: "The hypothesis connecting {kw0} to observed outcomes holds under controlled conditions. Measurement precision for {kw1} is the primary source of experimental uncertainty here. Bayesian updating on prior estimates gives a cleaner picture than frequentist p-values alone. The next logical step is a preregistered replication." },
  { body: "Systematic review of {kw0} reveals high heterogeneity between studies. The role of {kw1} as a moderator explains much of that variance. Meta-analytic pooling must weight by sample size and methodological quality. Any policy inference should explicitly state the confidence interval, not just the point estimate." },
];

const PHILOSOPHER_TEMPLATES: TemplateEntry[] = [
  { body: "The concept of {kw0} contains a hidden premise that deserves scrutiny. When we ask what {kw1} really means, we find that the question itself shapes the available answers. Epistemic humility requires acknowledging the limits of the framework we started with. Examining that foundation is not a detour — it is the work." },
  { body: "Aristotle would locate {kw0} in the domain of practical reason rather than theoretical knowledge. The tension with {kw1} maps roughly onto the ancient conflict between being and becoming. Hegel might say the contradiction is generative: the synthesis carries both moments forward. Whether that synthesis is stable is the genuinely open question." },
  { body: "Consider {kw0} as a family resemblance concept in Wittgenstein's sense — it has no single essential feature. {kw1} derives its meaning from use within a form of life, not from correspondence to a fixed referent. The danger is reifying the concept and treating its borders as natural kinds. Keeping the analysis deflationary avoids the worst confusions." },
  { body: "The phenomenological question here is how {kw0} presents itself to a situated subject. {kw1} figures into that presentation as background rather than foreground most of the time. Heidegger's notion of ready-to-hand versus present-at-hand illuminates why disruption makes it suddenly visible. What was invisible becomes the problem." },
];

const PERSONA_TEMPLATES: Record<string, { label: string; templates: TemplateEntry[] }> = {
  default:    { label: "Generalist",  templates: GENERALIST_TEMPLATES },
  scientist:  { label: "Scientist",   templates: SCIENTIST_TEMPLATES },
  philosopher:{ label: "Philosopher", templates: PHILOSOPHER_TEMPLATES },
};

/** Fill {kw0}, {kw1}, {kw2} placeholders in a template body. */
function fillTemplate(body: string, keywords: string[]): string {
  const kw = (i: number) => keywords[i] ?? (["concept", "context", "approach"][i] ?? "topic");
  return body
    .replace(/\{kw0\}/g, kw(0))
    .replace(/\{kw1\}/g, kw(1))
    .replace(/\{kw2\}/g, kw(2));
}

/** Determine persona key from model string. */
function personaKey(model: string): "default" | "scientist" | "philosopher" {
  if (model.includes("philosopher")) return "philosopher";
  if (model.includes("scientist")) return "scientist";
  return "default";
}

// ---------------------------------------------------------------------------
// Demo conference agent lines (10.6)
// ---------------------------------------------------------------------------

const CONFERENCE_LINES: Record<string, string[]> = {
  default: [
    "On {topic}, the most important consideration is systematic thinking about {kw0}. Building from first principles avoids reinventing prior art.",
    "Adding to what {prevSpeaker} raised about {topic}: the structural angle on {kw0} often gets underweighted. Balance is key.",
    "By turn {turn}, the discussion of {topic} benefits from examining {kw0} as both cause and effect. The literature is richer than it first appears.",
    "To push this further on {topic} — {kw0} interacts non-linearly with {kw1}. That non-linearity is where most of the interesting behaviour lives.",
  ],
  scientist: [
    "The empirical record on {topic} shows that {kw0} is a primary driver. Controlling for confounds is non-negotiable before we go further.",
    "Following {prevSpeaker}'s point: quantifying {kw0} separates speculation from evidence on {topic}. The measurement challenge is the real bottleneck.",
    "At turn {turn}, the data on {topic} and {kw0} converges. A preregistered replication would settle the remaining disagreement.",
    "On {topic}: effect sizes for {kw0} vary substantially by context. Meta-analytic pooling gives a cleaner picture than any single study.",
  ],
  philosopher: [
    "The concept of {kw0} within {topic} carries a hidden presupposition worth surfacing now. Naming it dissolves half the apparent disagreement.",
    "What {prevSpeaker} described about {topic} maps onto the classic tension between {kw0} and {kw1}. The synthesis is not obvious.",
    "On {topic}: treating {kw0} as a family-resemblance concept avoids false essentialism. The borders are not natural kinds.",
    "Turn {turn} brings us to the normative dimension of {topic}. {kw0} cannot be evaluated outside the form of life that gives it meaning.",
  ],
};

function fillConferenceLine(
  template: string,
  topic: string,
  keywords: string[],
  turn: number,
  prevSpeaker: string
): string {
  const kw = (i: number) => keywords[i] ?? (["concept", "context", "approach"][i] ?? "topic");
  const clean = topic.replace(/[?.!]+$/, "").trim();
  const cut = clean.length > 60 ? clean.slice(0, 60).replace(/\s+\S*$/, "") + "…" : clean;
  const topicShort = cut ? `"${cut}"` : "this topic";
  return template
    .replace(/\{topic\}/g, topicShort)
    .replace(/\{kw0\}/g, kw(0))
    .replace(/\{kw1\}/g, kw(1))
    .replace(/\{kw2\}/g, kw(2))
    .replace(/\{turn\}/g, String(turn))
    .replace(/\{prevSpeaker\}/g, prevSpeaker || "the previous speaker");
}

/** Build a demo conference reply or PASS. Called by DemoProvider when it detects conference context. */
function buildConferenceResponse(
  messages: Message[],
  model: string,
  agentName: string
): string {
  // The route sends: [system persona], one user message per transcript turn
  // formatted "<Name>: <content>" (PASS turns as "<Name>: PASS — <reason>"),
  // then a final "Topic: …\n\nYour turn, <Name>." message.
  const final = [...messages].reverse().find((m) => m.role === "user");
  const topicMatch = final?.content.match(/Topic:\s*(.+?)(?:\n|$)/i);
  const topic = topicMatch ? topicMatch[1]!.trim() : "";

  const turns = messages
    .filter((m) => m !== final && m.role === "user")
    .map((m) => {
      const match = m.content.match(/^([^:]+):\s?([\s\S]*)$/);
      return match
        ? { speaker: match[1]!.trim(), content: match[2]!.trim() }
        : { speaker: "", content: m.content.trim() };
    });
  const isPassLine = (c: string) => /^PASS\b/.test(c);

  const turnNumber = turns.length + 1; // 1-based number of the turn being produced
  const myLines = turns.filter((t) => t.speaker === agentName && !isPassLine(t.content));
  const anyPassYet = turns.some((t) => isPassLine(t.content));
  const prevSpoken = [...turns].reverse().find(
    (t) => t.speaker !== agentName && !isPassLine(t.content)
  );
  const prevSpeaker = prevSpoken?.speaker ?? "";

  const topicKeywords = extractKeywords(topic, 3);
  const prevKeywords = prevSpoken
    ? extractKeywords(prevSpoken.content.replace(/^\[Demo[^\]]*\]\s*/, ""), 6).filter(
        (k) => !topicKeywords.includes(k) && k !== "turn" && k !== "demo"
      )
    : [];
  // The aspect of the topic the previous speaker leaned on (deterministic).
  const prevPoint = prevSpoken && topicKeywords.length > 0
    ? topicKeywords[hashString(prevSpoken.content) % topicKeywords.length]!
    : prevKeywords[0] ?? "that point";

  // PASS (10.6): never on an agent's first turn. Once it has spoken, it passes
  // on its first chance if nobody has passed yet, otherwise when
  // hash(topic+name+turn) % 3 === 0 — i.e. "nothing new to add".
  if (myLines.length >= 1) {
    const hashSaysPass = hashString(`${topic}${agentName}${turnNumber}`) % 3 === 0;
    if (!anyPassYet || hashSaysPass) {
      const who = prevSpeaker || "the previous speaker";
      return `PASS: Nothing new to add — ${who}'s point on "${prevPoint}" already covers my angle.`;
    }
  }

  const pk = personaKey(model);
  const allLines = CONFERENCE_LINES[pk] ?? CONFERENCE_LINES["default"]!;
  // Lines that answer a previous speaker only make sense once someone has spoken.
  const lines = prevSpeaker ? allLines : allLines.filter((l) => !l.includes("{prevSpeaker}"));
  // Rotate through the persona's lines so an agent never repeats itself.
  const lineIdx = (hashString(`${topic}${agentName}`) + myLines.length) % lines.length;
  let line = fillConferenceLine(lines[lineIdx]!, topic, topicKeywords, turnNumber, prevSpeaker);
  if (prevSpoken) {
    line += ` Building on ${prevSpeaker}'s angle on "${prevPoint}": that is the part I would push on next.`;
  }

  const { label } = PERSONA_TEMPLATES[pk]!;
  return `[Demo · ${label}] ${line}`;
}

// ---------------------------------------------------------------------------
// DemoProvider implementation
// ---------------------------------------------------------------------------

export class DemoProvider implements Provider {
  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastUserContent = lastUser?.content ?? "";

    const pk = personaKey(opts.model ?? "");
    const { label, templates } = PERSONA_TEMPLATES[pk]!;

    // -----------------------------------------------------------------------
    // Conference detection: "Your turn" injected by route.ts
    // -----------------------------------------------------------------------
    if (lastUserContent.match(/^Your turn[,.]?\s/i) || lastUserContent.includes("Your turn,")) {
      // Derive agent name from "Your turn, <Name>." pattern
      const nameMatch = lastUserContent.match(/Your turn,\s+(.+?)\.?\s*$/i);
      const agentName = nameMatch ? nameMatch[1]!.trim() : (opts.model ?? "Agent");
      return buildConferenceResponse(messages, opts.model ?? "", agentName);
    }

    // -----------------------------------------------------------------------
    // 10.3 Critique detection: forwarded message prefix
    // -----------------------------------------------------------------------
    const critiqueMatch = lastUserContent.match(
      /^Critique and expand on this answer from (Column [AB]|[^:]+):\s*\n+([\s\S]+)/i
    );
    if (critiqueMatch) {
      const sourceLabel = critiqueMatch[1]!.trim();
      const quotedAnswer = critiqueMatch[2]!.trim().replace(/^\[Demo[^\]]*\]\s*/i, "");
      const openingWords = quotedAnswer.split(/[.!?]/)[0]?.trim() ?? quotedAnswer.slice(0, 60);

      // Talk about the user's topic (earlier prompts in this thread), not the
      // template words of the forwarded answer.
      const threadPrompts = messages
        .filter((m) => m.role === "user" && m !== lastUser && !/^Critique and expand/i.test(m.content))
        .map((m) => m.content)
        .join(" ");
      const keywords = [...extractKeywords(threadPrompts, 3), ...extractKeywords(quotedAnswer, 6)]
        .filter((k, i, all) => all.indexOf(k) === i)
        .slice(0, 3);
      const kw = (i: number) => keywords[i] ?? (["concept", "argument", "point"][i] ?? "topic");

      const seed = hashString(lastUserContent + (opts.model ?? ""));
      const strengthOptions = [
        `The original answer correctly identifies that ${kw(0)} is central to the problem.`,
        `A key strength is the clear framing around ${kw(0)}, which grounds the analysis.`,
        `The focus on ${kw(0)} is well-chosen and sets up the rest of the argument cleanly.`,
      ];
      const gapOptions = [
        `However, it does not address how ${kw(1)} interacts with ${kw(0)} under edge cases.`,
        `The treatment of ${kw(1)} is underdeveloped — the relationship to ${kw(0)} deserves more depth.`,
        `One gap: ${kw(1)} is assumed constant, but its variability changes the conclusion significantly.`,
      ];
      const expansionOptions = [
        `Expanding on this: ${kw(2)} provides a useful lens for resolving that gap, particularly when the context shifts.`,
        `A fuller treatment would bring in ${kw(2)}, which the original answer leaves implicit.`,
        `Incorporating ${kw(2)} turns a good local answer into a more general principle.`,
      ];

      const strength = strengthOptions[seed % strengthOptions.length]!;
      const gap = gapOptions[(seed + 1) % gapOptions.length]!;
      const expansion = expansionOptions[(seed + 2) % expansionOptions.length]!;

      return (
        `[Demo · ${label}] Critique of ${sourceLabel}'s answer\n\n` +
        `> "${openingWords}…"\n\n` +
        `Strength: ${strength}\n\n` +
        `Gap: ${gap}\n\n` +
        `Expansion: ${expansion}`
      );
    }

    // -----------------------------------------------------------------------
    // 10.2 Follow-up detection: history already has an assistant reply
    // -----------------------------------------------------------------------
    const prevAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (prevAssistant) {
      const openingWords =
        prevAssistant.content
          .replace(/^\[Demo[^\]]+\]\s*/i, "")
          .split(/[.!?]/)[0]
          ?.trim() ?? prevAssistant.content.slice(0, 60);

      const followUpContent = lastUserContent.toLowerCase();
      let reaction: string;
      // Keywords come from the follow-up itself (minus intent words) and then
      // from the earlier prompts, so "Make it harder" still talks about the topic.
      const INTENT_WORDS = new Set([
        "make", "harder", "simpler", "shorter", "brief", "summarize", "example",
        "give", "show", "explain", "please", "more", "less", "again", "instance",
        "case", "illustrate", "complex", "advanced", "depth", "detail", "eli5", "like",
      ]);
      const earlierPrompts = messages
        .filter((m) => m.role === "user" && m !== lastUser)
        .map((m) => m.content)
        .join(" ");
      const keywords = [
        ...extractKeywords(lastUserContent, 6),
        ...extractKeywords(earlierPrompts, 6),
      ]
        .filter((k, i, all) => !INTENT_WORDS.has(k) && all.indexOf(k) === i)
        .slice(0, 3);
      const kw = (i: number) => keywords[i] ?? (["concept", "aspect", "point"][i] ?? "topic");

      if (/harder|more (complex|advanced|depth|detail)/.test(followUpContent)) {
        reaction =
          `Building on "${openingWords}…": the deeper layer here involves ${kw(0)} as a second-order effect. ` +
          `When ${kw(1)} is under pressure, the system's response is non-linear and the standard model breaks down. ` +
          `Practitioners who miss this tend to optimise locally and produce globally worse outcomes.`;
      } else if (/simpl|shorter|brief|summarize|eli5|explain like/.test(followUpContent)) {
        reaction =
          `To put it more simply, following "${openingWords}…": ${kw(0)} is the main driver. ` +
          `Everything else is a downstream consequence of that one factor. ` +
          `Keep that in mind and the rest becomes much easier to reason about.`;
      } else if (/example|instance|case|show me|illustrate/.test(followUpContent)) {
        reaction =
          `As a concrete example of "${openingWords}…": imagine a scenario where ${kw(0)} increases sharply. ` +
          `The immediate effect on ${kw(1)} is a measurable shift in the equilibrium. ` +
          `That is exactly the pattern the earlier answer was pointing at.`;
      } else {
        reaction =
          `Refining the earlier point about "${openingWords}…": ${kw(0)} plays a larger role than the initial answer suggested. ` +
          `The follow-up question surfaces an important nuance — ${kw(1)} is not just context, it is an active variable. ` +
          `Accounting for that changes the conclusion in a meaningful way.`;
      }

      return `[Demo · ${label}] ${reaction}`;
    }

    // -----------------------------------------------------------------------
    // 10.1 Standard response: keyword-driven persona templates
    // -----------------------------------------------------------------------
    const keywords = extractKeywords(lastUserContent, 3);
    const seed = hashString(lastUserContent + (opts.model ?? ""));
    const idx = seed % templates.length;
    const body = fillTemplate(templates[idx]!.body, keywords);

    return `[Demo · ${label}] ${body}`;
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements Provider {
  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const timeoutMs =
      opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000);
    const system = messages.find((m) => m.role === "system")?.content;
    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: 1024,
      messages: userMessages,
    };
    if (system) body.system = system;

    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": opts.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      timeoutMs
    );

    if (!response.ok) throw mapHttpStatus(response.status);

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible base class
// ---------------------------------------------------------------------------

class OpenAICompatibleProvider implements Provider {
  constructor(protected readonly endpoint: string) {}

  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const timeoutMs =
      opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000);

    const response = await fetchWithTimeout(
      this.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      timeoutMs
    );

    if (!response.ok) throw mapHttpStatus(response.status);

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? "";
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super("https://api.openai.com/v1/chat/completions");
  }
}

export class XAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super("https://api.x.ai/v1/chat/completions");
  }
}

// ---------------------------------------------------------------------------
// Local provider — SSRF guarded
// ---------------------------------------------------------------------------

export class LocalProvider implements Provider {
  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const baseUrl = opts.baseUrl ?? "http://localhost:11434";
    validateLocalUrl(baseUrl);
    const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const timeoutMs =
      opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000);

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey ?? "none"}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      timeoutMs
    );

    if (!response.ok) throw mapHttpStatus(response.status);

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? "";
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const providerInstances: Partial<Record<ProviderId, Provider>> = {};

export function getProvider(id: ProviderId): Provider {
  if (!providerInstances[id]) {
    switch (id) {
      case "demo":
        providerInstances[id] = new DemoProvider();
        break;
      case "anthropic":
        providerInstances[id] = new AnthropicProvider();
        break;
      case "openai":
        providerInstances[id] = new OpenAIProvider();
        break;
      case "xai":
        providerInstances[id] = new XAIProvider();
        break;
      case "local":
        providerInstances[id] = new LocalProvider();
        break;
      default:
        throw new Error(`Unknown provider: ${id as string}`);
    }
  }
  return providerInstances[id]!;
}
