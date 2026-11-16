import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DemoProvider,
  fetchWithTimeout,
  ProviderTimeoutError,
  ProviderHTTPError,
  getProvider,
} from "../src/lib/providers.js";

// ---------------------------------------------------------------------------
// Demo provider — determinism
// ---------------------------------------------------------------------------

describe("DemoProvider", () => {
  const demo = new DemoProvider();

  it("returns the same output for identical inputs", async () => {
    const messages = [{ role: "user" as const, content: "Hello world" }];
    const opts = { model: "demo" };
    const a = await demo.complete(messages, opts);
    const b = await demo.complete(messages, opts);
    expect(a).toBe(b);
  });

  it("returns different output for different inputs", async () => {
    const opts = { model: "demo" };
    // Use inputs with different hash values to get different template indices
    const results = new Set<string>();
    const inputs = [
      "short",
      "a bit longer message",
      "this is a much longer message that should hash differently and pick a different template index from the ones above",
      "another completely different message for good measure to populate the set",
      "yet one more unique message string to ensure variety in demo outputs",
    ];
    for (const content of inputs) {
      const r = await demo.complete(
        [{ role: "user", content }],
        opts
      );
      results.add(r);
    }
    // With 5 inputs across 5 templates, expect at least 2 distinct outputs
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it("returns a non-empty string", async () => {
    const r = await demo.complete(
      [{ role: "user", content: "test" }],
      { model: "demo" }
    );
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(0);
  });

  it("is deterministic across separate instances", async () => {
    const d1 = new DemoProvider();
    const d2 = new DemoProvider();
    const messages = [{ role: "user" as const, content: "reproducibility check" }];
    const opts = { model: "demo" };
    expect(await d1.complete(messages, opts)).toBe(
      await d2.complete(messages, opts)
    );
  });
});

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves when fetch returns quickly", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(mockResponse));

    const result = await fetchWithTimeout("http://example.com", {}, 5000);
    expect(result.status).toBe(200);
  });

  it("throws ProviderTimeoutError when fetch is too slow", async () => {
    // fetch never resolves
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal) {
              signal.addEventListener("abort", () => {
                const err = new DOMException("Aborted", "AbortError");
                reject(err);
              });
            }
          })
      )
    );

    const promise = fetchWithTimeout("http://example.com", {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});

// ---------------------------------------------------------------------------
// HTTP error mapping
// ---------------------------------------------------------------------------

describe("HTTP error mapping via OpenAI-compatible provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function callWithStatus(status: number): Promise<ProviderHTTPError> {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("{}", { status }))
    );
    const { OpenAIProvider } = await import("../src/lib/providers.js");
    const provider = new OpenAIProvider();
    try {
      await provider.complete(
        [{ role: "user", content: "test" }],
        { model: "gpt-4", apiKey: "sk-test" }
      );
      throw new Error("Expected ProviderHTTPError");
    } catch (err) {
      if (err instanceof ProviderHTTPError) return err;
      throw err;
    }
  }

  it("maps 401 to 'Invalid or missing API key'", async () => {
    const err = await callWithStatus(401);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/key/i);
  });

  it("maps 429 to 'Rate limit exceeded'", async () => {
    const err = await callWithStatus(429);
    expect(err.status).toBe(429);
    expect(err.message).toMatch(/rate limit/i);
  });

  it("maps 500 to 'Provider internal server error'", async () => {
    const err = await callWithStatus(500);
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/internal/i);
  });
});

// ---------------------------------------------------------------------------
// getProvider factory
// ---------------------------------------------------------------------------

describe("getProvider", () => {
  it("returns a DemoProvider for id 'demo'", () => {
    const p = getProvider("demo");
    expect(p).toBeInstanceOf(DemoProvider);
  });

  it("throws for unknown provider id", () => {
    expect(() => getProvider("unknown" as never)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 10.8 — DemoProvider: persona distinction
// ---------------------------------------------------------------------------

describe("DemoProvider — distinct personas", () => {
  const demo = new DemoProvider();
  const prompt = "What is the best way to understand complex systems?";
  const messages = [{ role: "user" as const, content: prompt }];

  it("Generalist and Scientist produce different text for the same prompt", async () => {
    const generalist = await demo.complete(messages, { model: "demo" });
    const scientist = await demo.complete(messages, { model: "demo-scientist" });
    expect(generalist).not.toBe(scientist);
  });

  it("Generalist and Philosopher produce different text for the same prompt", async () => {
    const generalist = await demo.complete(messages, { model: "demo" });
    const philosopher = await demo.complete(messages, { model: "demo-philosopher" });
    expect(generalist).not.toBe(philosopher);
  });

  it("Scientist and Philosopher produce different text for the same prompt", async () => {
    const scientist = await demo.complete(messages, { model: "demo-scientist" });
    const philosopher = await demo.complete(messages, { model: "demo-philosopher" });
    expect(scientist).not.toBe(philosopher);
  });

  it("each persona label appears in the response", async () => {
    const generalist = await demo.complete(messages, { model: "demo" });
    const scientist = await demo.complete(messages, { model: "demo-scientist" });
    const philosopher = await demo.complete(messages, { model: "demo-philosopher" });
    expect(generalist).toMatch(/\[Demo · Generalist\]/);
    expect(scientist).toMatch(/\[Demo · Scientist\]/);
    expect(philosopher).toMatch(/\[Demo · Philosopher\]/);
  });
});

// ---------------------------------------------------------------------------
// 10.8 — DemoProvider: label prefix
// ---------------------------------------------------------------------------

describe("DemoProvider — [Demo · label] prefix", () => {
  const demo = new DemoProvider();

  it("every standard response starts with [Demo ·", async () => {
    const prompts = [
      "Tell me about machine learning",
      "Explain thermodynamics",
      "What is consciousness?",
      "How does a compiler work?",
    ];
    const models = ["demo", "demo-scientist", "demo-philosopher"];
    for (const content of prompts) {
      for (const model of models) {
        const result = await demo.complete(
          [{ role: "user", content }],
          { model }
        );
        expect(result, `model=${model} prompt="${content}"`).toMatch(/^\[Demo ·/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10.8 — DemoProvider: distinct prompts produce distinct output
// ---------------------------------------------------------------------------

describe("DemoProvider — distinct prompts", () => {
  const demo = new DemoProvider();

  it("produces at least 3 distinct responses across 5 varied prompts with the same model", async () => {
    const prompts = [
      "Explain quantum entanglement in detail",
      "How should I design a microservices architecture",
      "What causes inflation in modern economies",
      "Describe the history of the Roman Empire",
      "How do neural networks learn from data",
    ];
    const results = new Set<string>();
    for (const content of prompts) {
      const r = await demo.complete([{ role: "user", content }], { model: "demo" });
      results.add(r);
    }
    expect(results.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 10.8 — DemoProvider: follow-up references previous answer
// ---------------------------------------------------------------------------

describe("DemoProvider — follow-up references previous answer", () => {
  const demo = new DemoProvider();

  async function getInitialAnswer(prompt: string, model = "demo"): Promise<string> {
    return demo.complete([{ role: "user", content: prompt }], { model });
  }

  it("follow-up reply quotes the opening words of the previous assistant answer", async () => {
    const prompt = "Explain the nature of entropy in thermodynamics";
    const firstAnswer = await getInitialAnswer(prompt);

    // Strip the [Demo · label] prefix to get raw opening words
    const rawFirst = firstAnswer.replace(/^\[Demo[^\]]+\]\s*/i, "");
    const openingWords = rawFirst.split(/[.!?]/)[0]?.trim() ?? rawFirst.slice(0, 60);

    const followUp = await demo.complete(
      [
        { role: "user", content: prompt },
        { role: "assistant", content: firstAnswer },
        { role: "user", content: "Can you explain that in simpler terms?" },
      ],
      { model: "demo" }
    );

    // The follow-up must include at least the beginning of the first sentence
    expect(followUp).toContain(openingWords.slice(0, 20));
  });

  it("harder follow-up returns a more complex response", async () => {
    const prompt = "What is machine learning?";
    const firstAnswer = await getInitialAnswer(prompt);

    const followUp = await demo.complete(
      [
        { role: "user", content: prompt },
        { role: "assistant", content: firstAnswer },
        { role: "user", content: "Make it harder, go deeper" },
      ],
      { model: "demo" }
    );

    expect(followUp).toMatch(/\[Demo ·/);
    // Should reference the previous answer's opening words
    const rawFirst = firstAnswer.replace(/^\[Demo[^\]]+\]\s*/i, "");
    const openingWords = rawFirst.split(/[.!?]/)[0]?.trim() ?? "";
    expect(followUp).toContain(openingWords.slice(0, 15));
  });

  it("example follow-up includes a concrete example reference", async () => {
    const prompt = "What is recursion in programming?";
    const firstAnswer = await getInitialAnswer(prompt);

    const followUp = await demo.complete(
      [
        { role: "user", content: prompt },
        { role: "assistant", content: firstAnswer },
        { role: "user", content: "Give me an example" },
      ],
      { model: "demo" }
    );

    expect(followUp).toMatch(/\[Demo ·/);
    // Example path: "As a concrete example of"
    expect(followUp).toMatch(/example/i);
  });

  it("follow-up is different from the first answer", async () => {
    const prompt = "What is the speed of light?";
    const firstAnswer = await getInitialAnswer(prompt);

    const followUp = await demo.complete(
      [
        { role: "user", content: prompt },
        { role: "assistant", content: firstAnswer },
        { role: "user", content: "Tell me more" },
      ],
      { model: "demo" }
    );

    expect(followUp).not.toBe(firstAnswer);
  });
});

// ---------------------------------------------------------------------------
// 10.8 — DemoProvider: critique quotes the source
// ---------------------------------------------------------------------------

describe("DemoProvider — critique quotes the source", () => {
  const demo = new DemoProvider();

  it("critique response contains the [Demo · label] prefix", async () => {
    const sourceAnswer =
      "The economic system depends on supply and demand equilibrium. " +
      "When prices rise, consumers reduce consumption. " +
      "This feedback loop stabilises markets over time.";

    const result = await demo.complete(
      [
        {
          role: "user",
          content:
            `Critique and expand on this answer from Column A:\n\n${sourceAnswer}`,
        },
      ],
      { model: "demo" }
    );

    expect(result).toMatch(/^\[Demo ·/);
  });

  it("critique response mentions 'Critique of Column A'", async () => {
    const sourceAnswer =
      "Neural networks learn by adjusting weights through backpropagation. " +
      "Gradient descent minimises the loss function iteratively.";

    const result = await demo.complete(
      [
        {
          role: "user",
          content:
            `Critique and expand on this answer from Column A:\n\n${sourceAnswer}`,
        },
      ],
      { model: "demo" }
    );

    expect(result).toMatch(/Critique of Column A/);
  });

  it("critique response quotes the opening words of the forwarded answer", async () => {
    const sourceAnswer =
      "Photosynthesis converts light energy into chemical energy. " +
      "Chlorophyll captures photons and drives the reaction.";

    const result = await demo.complete(
      [
        {
          role: "user",
          content:
            `Critique and expand on this answer from Column A:\n\n${sourceAnswer}`,
        },
      ],
      { model: "demo" }
    );

    // The first sentence of sourceAnswer, before the period
    const openingWords = sourceAnswer.split(".")[0]!.trim();
    // Must appear quoted
    expect(result).toContain(`"${openingWords}`);
  });

  it("critique response includes Strength, Gap, and Expansion sections", async () => {
    const sourceAnswer =
      "Climate change is driven by greenhouse gas emissions. " +
      "CO2 traps heat in the atmosphere, raising global temperatures.";

    const result = await demo.complete(
      [
        {
          role: "user",
          content:
            `Critique and expand on this answer from Column A:\n\n${sourceAnswer}`,
        },
      ],
      { model: "demo" }
    );

    expect(result).toMatch(/Strength:/);
    expect(result).toMatch(/Gap:/);
    expect(result).toMatch(/Expansion:/);
  });

  it("critique uses the named source label (not just Column A)", async () => {
    const sourceAnswer = "Gravity is a curvature of spacetime caused by mass.";

    const result = await demo.complete(
      [
        {
          role: "user",
          content:
            `Critique and expand on this answer from Column B:\n\n${sourceAnswer}`,
        },
      ],
      { model: "demo" }
    );

    expect(result).toMatch(/Critique of Column B/);
  });
});

// ---------------------------------------------------------------------------
// 10.8 / 10.9 — DemoProvider: conference variation and PASS
// ---------------------------------------------------------------------------

type Msg = { role: "user" | "assistant" | "system"; content: string };
type FakeTurn = { speaker: string; content: string };

/** Mirrors how /api/conference builds the provider messages. */
function confMessages(topic: string, agentName: string, turns: FakeTurn[]): Msg[] {
  return [
    { role: "system", content: `You are ${agentName} in a moderated conference.` },
    ...turns.map((t) => ({ role: "user" as const, content: `${t.speaker}: ${t.content}` })),
    { role: "user", content: `Topic: ${topic}\n\nYour turn, ${agentName}.` },
  ];
}

/** Simulate a round-robin conference using only the DemoProvider. */
async function simulate(
  topic: string,
  agents: Array<{ name: string; model: string }>,
  maxTurns: number
): Promise<Array<FakeTurn & { pass: boolean }>> {
  const demo = new DemoProvider();
  const out: Array<FakeTurn & { pass: boolean }> = [];
  let idx = 0;
  for (let t = 0; t < maxTurns; t++) {
    const agent = agents[idx]!;
    const reply = await demo.complete(
      confMessages(
        topic,
        agent.name,
        out.map((o) => ({ speaker: o.speaker, content: o.pass ? `PASS — ${o.content}` : o.content }))
      ),
      { model: agent.model }
    );
    const pass = reply.startsWith("PASS:");
    out.push({ speaker: agent.name, content: pass ? reply.slice(5).trim() : reply, pass });
    idx = (idx + 1) % agents.length;
  }
  return out;
}

const THREE = [
  { name: "Dr. Volt", model: "demo-scientist" },
  { name: "Prof. Stitch", model: "demo-philosopher" },
  { name: "Agent 3", model: "demo" },
];

describe("DemoProvider — conference variation", () => {
  const demo = new DemoProvider();

  it("first turn mentions the topic keywords and is labelled", async () => {
    const r = await demo.complete(confMessages("quantum computing breakthroughs", "Dr. Volt", []), {
      model: "demo-scientist",
    });
    expect(r).toMatch(/^\[Demo · Scientist\]/);
    expect(r.toLowerCase()).toMatch(/quantum/);
  });

  it("no spoken line repeats in a 3-agent, 6-turn conference", async () => {
    const turns = await simulate("Is determinism compatible with free will?", THREE, 6);
    const spoken = turns.filter((t) => !t.pass).map((t) => t.content);
    expect(new Set(spoken).size).toBe(spoken.length);
  });

  it("an agent's second line differs from its first", async () => {
    const turns = await simulate("remote work and productivity", THREE.slice(0, 2), 6);
    const volt = turns.filter((t) => t.speaker === "Dr. Volt" && !t.pass).map((t) => t.content);
    expect(volt.length).toBeGreaterThanOrEqual(1);
    expect(new Set(volt).size).toBe(volt.length);
  });

  it("replies reference the previous speaker by name", async () => {
    const r = await demo.complete(
      confMessages("city transit", "Prof. Stitch", [
        { speaker: "Dr. Volt", content: "[Demo · Scientist] Ridership data shows buses outperform trams." },
      ]),
      { model: "demo-philosopher" }
    );
    expect(r).toContain("Dr. Volt");
  });

  it("different topics produce different lines", async () => {
    const a = await demo.complete(confMessages("ocean plastics", "Dr. Volt", []), { model: "demo-scientist" });
    const b = await demo.complete(confMessages("medieval castles", "Dr. Volt", []), { model: "demo-scientist" });
    expect(a).not.toBe(b);
  });

  it("is deterministic for identical inputs", async () => {
    const m = confMessages("ocean plastics", "Dr. Volt", [{ speaker: "Prof. Stitch", content: "A point." }]);
    expect(await demo.complete(m, { model: "demo-scientist" })).toBe(
      await demo.complete(m, { model: "demo-scientist" })
    );
  });
});

describe("DemoProvider — PASS in conference", () => {
  const demo = new DemoProvider();

  it("never PASSes on an agent's first turn", async () => {
    const turns = await simulate("Is determinism compatible with free will?", THREE, 3);
    expect(turns.every((t) => !t.pass)).toBe(true);
  });

  it("3 agents, round-robin, 6 turns: at least one PASS with a reason", async () => {
    for (const topic of [
      "Is determinism compatible with free will?",
      "Should cities ban cars downtown?",
      "What is consciousness?",
    ]) {
      const turns = await simulate(topic, THREE, 6);
      const passes = turns.filter((t) => t.pass);
      expect(passes.length).toBeGreaterThanOrEqual(1);
      for (const p of passes) {
        expect(p.content).toMatch(/Nothing new to add/);
        expect(p.content.length).toBeGreaterThan(10);
      }
    }
  });

  it("PASS reply has the form 'PASS: <reason>' naming the previous speaker", async () => {
    const r = await demo.complete(
      confMessages("ocean plastics", "Dr. Volt", [
        { speaker: "Dr. Volt", content: "[Demo · Scientist] Microplastic counts doubled." },
        { speaker: "Prof. Stitch", content: "[Demo · Philosopher] Responsibility is diffuse." },
      ]),
      { model: "demo-scientist" }
    );
    expect(r).toMatch(/^PASS:\s+\S/);
    expect(r).toContain("Prof. Stitch");
  });
});

describe("DemoProvider — critique talks about the thread's topic", () => {
  it("uses keywords from the original prompt in the column's thread", async () => {
    const demo = new DemoProvider();
    const r = await demo.complete(
      [
        { role: "user", content: "How do volcanoes form under the ocean?" },
        { role: "assistant", content: "[Demo · Scientist] Magma rises through vents." },
        {
          role: "user",
          content:
            "Critique and expand on this answer from Column A:\n\n[Demo · Generalist] There is a useful tension between volcanoes and simplicity.",
        },
      ],
      { model: "demo-scientist" }
    );
    expect(r).toContain("Critique of Column A's answer");
    expect(r).toMatch(/Strength: .*volcanoes/);
    expect(r).not.toMatch(/\[Demo · Generalist\]/);
  });
});
