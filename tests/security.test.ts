import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateLocalUrl, SSRFError } from "../src/lib/security.js";

function blocked(url: string) {
  expect(() => validateLocalUrl(url), `expected ${url} to be blocked`).toThrow(SSRFError);
}

function allowed(url: string) {
  expect(() => validateLocalUrl(url), `expected ${url} to be allowed`).not.toThrow();
}

describe("validateLocalUrl — scheme enforcement", () => {
  it("rejects file:// URLs", () => blocked("file:///etc/passwd"));
  it("rejects ftp:// URLs", () => blocked("ftp://example.com/data"));
  it("allows http:// public URLs", () => allowed("http://example.com/api"));
  it("allows https:// public URLs", () => allowed("https://api.openai.com/v1"));
  it("throws SSRFError for unparseable URLs", () =>
    expect(() => validateLocalUrl("not a url")).toThrow(SSRFError));
});

describe("validateLocalUrl — private/loopback blocking (default, no env override)", () => {
  beforeEach(() => {
    delete process.env.ALLOW_LOCAL_URLS;
    delete process.env.LOCAL_URL_ALLOWLIST;
  });

  it("blocks 127.0.0.1 (loopback)", () => blocked("http://127.0.0.1:11434"));
  it("blocks 127.0.0.2 (loopback range)", () => blocked("http://127.0.0.2/api"));
  it("blocks 10.0.0.1 (RFC-1918 class-A)", () => blocked("http://10.0.0.1/"));
  it("blocks 172.16.0.1 (RFC-1918 class-B lower)", () => blocked("http://172.16.0.1/"));
  it("blocks 172.31.255.255 (RFC-1918 class-B upper)", () => blocked("http://172.31.255.255/"));
  it("blocks 192.168.1.1 (RFC-1918 class-C)", () => blocked("http://192.168.1.1/"));
  it("blocks 169.254.169.254 (AWS metadata / link-local)", () =>
    blocked("http://169.254.169.254/latest/meta-data/"));
  it("blocks 169.254.0.1 (any link-local)", () => blocked("http://169.254.0.1/"));
  it("blocks 100.64.0.1 (CGNAT/shared space RFC 6598)", () =>
    blocked("http://100.64.0.1/"));
  it("blocks 100.127.255.255 (CGNAT upper bound)", () =>
    blocked("http://100.127.255.255/"));
  it("blocks 0.0.0.0", () => blocked("http://0.0.0.0/"));
  it("blocks 0.1.2.3 ('this network')", () => blocked("http://0.1.2.3/"));
  it("blocks localhost hostname", () => blocked("http://localhost/"));
  it("blocks ::1 (IPv6 loopback)", () => blocked("http://[::1]/"));
  it("blocks :: (IPv6 unspecified)", () => blocked("http://[::]/"));
  it("blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)", () =>
    blocked("http://[::ffff:127.0.0.1]/"));
  it("blocks ::ffff:192.168.1.1 (IPv4-mapped private)", () =>
    blocked("http://[::ffff:192.168.1.1]/"));
  it("blocks fc00::1 (IPv6 unique-local)", () => blocked("http://[fc00::1]/"));
  it("blocks fe80::1 (IPv6 link-local)", () => blocked("http://[fe80::1]/"));
  it("blocks bare hostname with no TLD", () => blocked("http://myhost/api"));
});

describe("validateLocalUrl — ALLOW_LOCAL_URLS=true", () => {
  beforeEach(() => {
    process.env.ALLOW_LOCAL_URLS = "true";
    delete process.env.LOCAL_URL_ALLOWLIST;
  });

  afterEach(() => {
    delete process.env.ALLOW_LOCAL_URLS;
  });

  it("allows localhost when ALLOW_LOCAL_URLS=true", () =>
    allowed("http://localhost:11434/v1/chat/completions"));
  it("allows 127.0.0.1 when ALLOW_LOCAL_URLS=true", () =>
    allowed("http://127.0.0.1:11434/"));
  it("still blocks file:// even when ALLOW_LOCAL_URLS=true", () =>
    blocked("file:///etc/passwd"));
});

describe("validateLocalUrl — LOCAL_URL_ALLOWLIST", () => {
  beforeEach(() => {
    delete process.env.ALLOW_LOCAL_URLS;
    process.env.LOCAL_URL_ALLOWLIST = "my-ollama.internal,gpu.corp.example.com";
  });

  afterEach(() => {
    delete process.env.LOCAL_URL_ALLOWLIST;
  });

  it("allows a hostname on the allowlist", () =>
    allowed("http://my-ollama.internal/v1/chat/completions"));
  it("allows another hostname on the allowlist", () =>
    allowed("http://gpu.corp.example.com/v1"));
  it("blocks a hostname not on the allowlist", () =>
    blocked("http://evil.internal/"));
  it("blocks a public hostname not on the allowlist", () =>
    blocked("http://example.com/"));
});
