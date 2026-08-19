import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const get = (path, params) => axios.get(`${BASE}${path}`, { params }).then((response) => response.data);
const post = (path, body) => axios.post(`${BASE}${path}`, body).then((response) => response.data);
const adminPost = (path, body) => axios.post(`${BASE}${path}`, body).then((response) => response.data);
const patch = (path, body) => axios.patch(`${BASE}${path}`, body).then((response) => response.data);

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
  integrationAudit: (id) => get(`/integrations/${encodeURIComponent(id)}/audit`),
  auditTimeline: () => get("/audit-timeline"),
  providerLedger: () => get("/provider-ledger"),
  initializeGmailReadiness: (reason) => adminPost("/integrations/gmail/initialize", { reason }),
  changeIntegrationLifecycle: (id, action, reason) => adminPost(`/integrations/${encodeURIComponent(id)}/lifecycle`, { action, reason }),
  assignIntegrationRecoveryOwner: (id, displayName, reason) => adminPost(`/integrations/${encodeURIComponent(id)}/recovery-owner`, { display_name: displayName, reason }),
  shopifyStatus: (live = true) => get("/shopify/status", { live }),
  syncRuns: () => get("/shopify/sync-runs"),
  syncShopify: () => post("/shopify/sync", {}),

  // Temporary compatibility helpers for pages removed from primary navigation.
  workItems: (view) => get("/work-items", { view }),
  updateWorkItem: (id, body) => patch(`/work-items/${id}`, body),
  addNote: (id, text) => post(`/orders/${id}/notes`, { text }),
  pauseUpdates: (id, body) => post(`/orders/${id}/pause-updates`, body),
  addTimelineEvent: (id, body) => post(`/orders/${id}/timeline`, body),
  conversations: (filter) => get("/conversations", { filter }),
  conversation: (id) => get(`/conversations/${id}`),
  sendMessage: (id, body) => post(`/conversations/${id}/messages`, body),
  updateConversation: (id, body) => patch(`/conversations/${id}`, body),
  advanceFulfillment: (id, body) => post(`/fulfillment/${id}/advance`, body || {}),
  scanFulfillment: (id, code) => post(`/fulfillment/${id}/scan`, { code }),
  rma: (id) => get(`/returns/${id}`),
  updateReturn: (id, body) => patch(`/returns/${id}`, body),
  appointments: () => get("/appointments"),
  updateAppointment: (id, body) => patch(`/appointments/${id}`, body),
  automations: () => get("/automations"),
  updateAutomation: (id, body) => patch(`/automations/${id}`, body),
  runs: () => get("/automations/runs"),
  run: (id) => get(`/automations/runs/${id}`),
  approvals: () => get("/approvals"),
  decideApproval: (id, body) => post(`/approvals/${id}/decision`, body),
  notifications: () => get("/notifications"),
  markNotification: (id) => patch(`/notifications/${id}`),
  purchasing: () => get("/purchasing"),
};
