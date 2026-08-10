import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Clean data layer — swap this module for real integrations later without UI changes.
const get = (path, params) => axios.get(`${BASE}${path}`, { params }).then((r) => r.data);
const post = (path, body) => axios.post(`${BASE}${path}`, body).then((r) => r.data);
const patch = (path, body) => axios.patch(`${BASE}${path}`, body).then((r) => r.data);

export const api = {
  overview: () => get("/overview"),
  workItems: (view) => get("/work-items", { view }),
  updateWorkItem: (id, body) => patch(`/work-items/${id}`, body),
  orders: (params) => get("/orders", params),
  order: (id) => get(`/orders/${id}`),
  addNote: (id, text) => post(`/orders/${id}/notes`, { text }),
  pauseUpdates: (id, body) => post(`/orders/${id}/pause-updates`, body),
  addTimelineEvent: (id, body) => post(`/orders/${id}/timeline`, body),
  conversations: (filter) => get("/conversations", { filter }),
  conversation: (id) => get(`/conversations/${id}`),
  sendMessage: (id, body) => post(`/conversations/${id}/messages`, body),
  updateConversation: (id, body) => patch(`/conversations/${id}`, body),
  fulfillment: () => get("/fulfillment"),
  advanceFulfillment: (id, body) => post(`/fulfillment/${id}/advance`, body || {}),
  scanFulfillment: (id, code) => post(`/fulfillment/${id}/scan`, { code }),
  inventory: () => get("/inventory"),
  inventoryItem: (sku) => get(`/inventory/${sku}`),
  returns: () => get("/returns"),
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
  integrations: () => get("/integrations"),
  notifications: () => get("/notifications"),
  markNotification: (id) => patch(`/notifications/${id}`),
  purchasing: () => get("/purchasing"),
  reports: () => get("/reports"),
  search: (q) => get("/search", { q }),
};
