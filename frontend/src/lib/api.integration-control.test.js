import axios from "axios";
import { api } from "./api";

jest.mock("axios");

const localMutationConfig = { headers: { "X-Erydez-Request": "local-console" } };

describe("local integration-control API", () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    axios.get.mockResolvedValue({ data: { items: [] } });
    axios.post.mockResolvedValue({ data: { ok: true } });
  });

  test("initializes Gmail readiness with local browser provenance but no actor identity", async () => {
    await expect(api.initializeGmailReadiness("Initialize approved local Gmail readiness record")).resolves.toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/integrations/gmail/initialize"),
      { reason: "Initialize approved local Gmail readiness record" },
      localMutationConfig,
    );
  });

  test("records lifecycle intent through the local mutation guard", async () => {
    await api.changeIntegrationLifecycle("gmail-local", "pause", "Pause for local maintenance review");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/integrations/gmail-local/lifecycle"),
      { action: "pause", reason: "Pause for local maintenance review" },
      localMutationConfig,
    );
  });

  test("records a readiness check explicitly instead of writing during a GET", async () => {
    await api.recordIntegrationHealth("gmail-local");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/integrations/gmail-local/health"),
      {},
      localMutationConfig,
    );
  });

  test("uses a same-origin API base when no separate development backend is configured", async () => {
    await api.syncShopify();
    expect(axios.post).toHaveBeenCalledWith("/api/shopify/sync", {}, localMutationConfig);
  });

  test("fetches the read-only global audit timeline", async () => {
    await expect(api.auditTimeline()).resolves.toEqual({ items: [] });
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/audit-timeline"), { params: undefined });
  });

  test("fetches the local read-only provider ledger", async () => {
    await expect(api.providerLedger()).resolves.toEqual({ items: [] });
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/provider-ledger"), { params: undefined });
  });

  test("retains only the active Gmail helper surface", () => {
    expect(api.gmailMessages).toBeUndefined();
    expect(api.sendGmailMessage).toBeUndefined();
    expect(api.activateGmailWatch).toBeUndefined();
    expect(api.gmailSend).toBeDefined();
  });
});
