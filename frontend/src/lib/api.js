import axios from "axios";

const backendOrigin = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const BASE = `${backendOrigin}/api`;
const mutationConfig = {
  headers: {
    "X-Erydez-Request": "local-console",
  },
};

const get = (path, params) => axios.get(`${BASE}${path}`, { params }).then((response) => response.data);
const post = (path, body) => axios.post(`${BASE}${path}`, body, mutationConfig).then((response) => response.data);
const patch = (path, body) => axios.patch(`${BASE}${path}`, body, mutationConfig).then((response) => response.data);

export const api = {
  overview: () => get("/overview"),
  orders: (params) => get("/orders", params),
  order: (id) => get(`/orders/${encodeURIComponent(id)}`),
  products: (params) => get("/products", params),
  product: (id) => get(`/products/${encodeURIComponent(id)}`),
  inventory: (params) => get("/inventory", params),
  inventoryItem: (id) => get(`/inventory/${encodeURIComponent(id)}`),
  customers: (params) => get("/customers", params),
  customer: (id) => get(`/customers/${encodeURIComponent(id)}`),
  fulfillments: () => get("/fulfillments"),
  fulfillment: () => get("/fulfillment"),
  refunds: () => get("/refunds"),
  returns: () => get("/returns"),
  returnRecord: (id) => get(`/returns/${encodeURIComponent(id)}`),
  reports: () => get("/reports"),
  search: (q) => get("/search", { q }),
  integrations: () => get("/integrations"),
  integration: (id) => get(`/integrations/${encodeURIComponent(id)}`),
  integrationHealth: (id) => get(`/integrations/${encodeURIComponent(id)}/health`),
  recordIntegrationHealth: (id) => post(`/integrations/${encodeURIComponent(id)}/health`, {}),
  integrationAudit: (id) => get(`/integrations/${encodeURIComponent(id)}/audit`),
  auditTimeline: () => get("/audit-timeline"),
  providerLedger: () => get("/provider-ledger"),
  initializeGmailReadiness: (reason) => post("/integrations/gmail/initialize", { reason }),
  changeIntegrationLifecycle: (id, action, reason) => post(`/integrations/${encodeURIComponent(id)}/lifecycle`, { action, reason }),
  assignIntegrationRecoveryOwner: (id, displayName, reason) => post(`/integrations/${encodeURIComponent(id)}/recovery-owner`, { display_name: displayName, reason }),
  shopifyStatus: (live = true) => get("/shopify/status", { live }),
  syncRuns: () => get("/shopify/sync-runs"),
  syncShopify: () => post("/shopify/sync", {}),

  // Gmail integration (Google OAuth 2.0 + Gmail API)
  gmailStatus: () => get("/gmail/status"),
  gmailOAuthStartUrl: () => `${BASE}/gmail/oauth/start`,
  gmailDisconnect: () => post("/gmail/disconnect", {}),
  gmailThreads: (params) => get("/gmail/threads", params),
  gmailThread: (threadId) => get(`/gmail/threads/${encodeURIComponent(threadId)}`),
  // Optional payload fields: sender_name, language, instructions, profile_id.
  gmailAiReply: (threadId, payload) => post(`/gmail/threads/${encodeURIComponent(threadId)}/ai-reply`, payload || {}),
  gmailSend: (body) => post("/gmail/send", body),
};
