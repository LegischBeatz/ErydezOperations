import axios from "axios";
import { api } from "./api";

jest.mock("axios");

describe("F-009a integration-control API", () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    axios.get.mockResolvedValue({ data: { items: [] } });
    axios.post.mockResolvedValue({ data: { ok: true } });
  });

  test("initializes Gmail readiness without a browser-supplied actor header", async () => {
    await expect(api.initializeGmailReadiness("Initialize approved local Gmail readiness record")).resolves.toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/integrations/gmail/initialize"),
      { reason: "Initialize approved local Gmail readiness record" },
    );
  });

  test("records lifecycle intent through the header-free control-plane endpoint", async () => {
    await api.changeIntegrationLifecycle("gmail-local", "pause", "Pause for local maintenance review");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/integrations/gmail-local/lifecycle"),
      { action: "pause", reason: "Pause for local maintenance review" },
    );
  });

  test("fetches the read-only global audit timeline", async () => {
    await expect(api.auditTimeline()).resolves.toEqual({ items: [] });
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/audit-timeline"), { params: undefined });
  });

  test("fetches the local read-only provider ledger", async () => {
    await expect(api.providerLedger()).resolves.toEqual({ items: [] });
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/provider-ledger"), { params: undefined });
  });

  test("does not expose message sync or sending helpers in the F-009a API surface", () => {
    expect(api.gmailMessages).toBeUndefined();
    expect(api.sendGmailMessage).toBeUndefined();
    expect(api.activateGmailWatch).toBeUndefined();
  });
});
