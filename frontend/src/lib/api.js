import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 120000 });

export async function translateVideo(blob, { mode = "video", duration } = {}) {
  const fd = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  fd.append("file", blob, `clip.${ext}`);
  fd.append("mode", mode);
  if (duration != null) fd.append("duration", String(duration));
  const { data } = await api.post("/translate/video", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function translateFrames(frames, { mode = "streaming", duration } = {}) {
  const { data } = await api.post("/translate/frames", { frames, mode, duration });
  return data;
}

export async function translateFingerspelling(frames) {
  const { data } = await api.post("/translate/fingerspelling", { frames });
  return data;
}

export async function getTranslation(id) {
  const { data } = await api.get(`/translation/${id}`);
  return data;
}

export async function textToSign(text, target_language = "auto") {
  const { data } = await api.post("/translate/text-to-sign", {
    text,
    target_language,
  });
  return data;
}

export async function getHistory() {
  const { data } = await api.get("/history");
  return data;
}

export async function deleteHistoryItem(id) {
  const { data } = await api.delete(`/history/${id}`);
  return data;
}

export async function clearHistory() {
  const { data } = await api.delete(`/history`);
  return data;
}

export async function getDictionary({ q = "", language = "all" } = {}) {
  const { data } = await api.get("/dictionary", { params: { q, language } });
  return data;
}

export async function getLanguages() {
  const { data } = await api.get("/dictionary/languages");
  return data.languages;
}

export async function getAnalyticsSummary(days = 14) {
  const { data } = await api.get("/analytics/summary", { params: { days } });
  return data;
}

export async function trackEvent(type, data = {}) {
  try {
    await api.post("/analytics/event", { type, data });
  } catch {}
}

export async function getSignOfTheDay() {
  const { data } = await api.get("/dictionary/sign-of-the-day");
  return data;
}

export async function submitCommunitySign(payload) {
  const { data } = await api.post("/dictionary/submit", payload);
  return data;
}

export async function getCommunitySigns(status = "approved") {
  const { data } = await api.get("/dictionary/community", { params: { status } });
  return data;
}

export async function validatePractice(payload) {
  const { data } = await api.post("/practice/validate", payload);
  return data;
}

// ---- Billing ----
export async function getPlans() {
  const { data } = await api.get("/billing/plans");
  return data;
}
export async function createCheckout(packageId, originUrl, email) {
  const { data } = await api.post("/billing/checkout", {
    package_id: packageId,
    origin_url: originUrl,
    email: email || null,
  });
  return data;
}
export async function getCheckoutStatus(sessionId) {
  const { data } = await api.get(`/billing/status/${sessionId}`);
  return data;
}

// ---- Admin / API keys ----
export async function adminLogin(password) {
  const { data } = await api.post("/admin/login", { password });
  return data;
}
export async function adminListKeys(password) {
  const { data } = await api.get("/admin/api-keys", {
    headers: { "X-Admin-Password": password },
  });
  return data;
}
export async function adminCreateKey(password, label, dailyLimit = 1000) {
  const { data } = await api.post(
    "/admin/api-keys",
    { label, daily_limit: dailyLimit },
    { headers: { "X-Admin-Password": password } },
  );
  return data;
}
export async function adminDeleteKey(password, keyId) {
  const { data } = await api.delete(`/admin/api-keys/${keyId}`, {
    headers: { "X-Admin-Password": password },
  });
  return data;
}

// ---- Email ----
export async function getEmailStatus() {
  const { data } = await api.get("/email/status");
  return data;
}
export async function sendShareEmail(payload) {
  const { data } = await api.post("/email/share", payload);
  return data;
}

// ---- WebRTC ----
export async function createRtcRoom() {
  const { data } = await api.post("/rtc/room");
  return data;
}
export async function getIceServers() {
  const { data } = await api.get("/rtc/ice");
  return data;
}

// ---- Offline pack ----
export async function getOfflinePack(limit = 30) {
  const { data } = await api.get("/offline/pack", { params: { limit } });
  return data;
}

// ---- Admin Teaching / KB ----
const adminH = (pwd) => ({ headers: { "X-Admin-Password": pwd } });

export async function teachingUpload(pwd, file, label = "") {
  const fd = new FormData();
  fd.append("file", file);
  if (label) fd.append("label", label);
  const { data } = await api.post("/admin/teaching/upload", fd, {
    headers: { "X-Admin-Password": pwd, "Content-Type": "multipart/form-data" },
  });
  return data;
}
export async function teachingListFiles(pwd) {
  const { data } = await api.get("/admin/teaching/files", adminH(pwd));
  return data;
}
export async function teachingDelete(pwd, id) {
  const { data } = await api.delete(`/admin/teaching/files/${id}`, adminH(pwd));
  return data;
}
export async function teachingReplace(pwd, id, file, label = "") {
  const fd = new FormData();
  fd.append("file", file);
  if (label) fd.append("label", label);
  const { data } = await api.put(`/admin/teaching/files/${id}`, fd, {
    headers: { "X-Admin-Password": pwd, "Content-Type": "multipart/form-data" },
  });
  return data;
}
export async function teachingRenameFile(pwd, id, label) {
  const { data } = await api.patch(`/admin/teaching/files/${id}`, { label }, adminH(pwd));
  return data;
}
export async function teachingProcess(pwd, id) {
  const { data } = await api.post(`/admin/teaching/process/${id}`, {}, adminH(pwd));
  return data;
}
export async function teachingKnowledge(pwd, { q = "", language = "all", confidence = "all", limit = 200 } = {}) {
  const { data } = await api.get("/admin/teaching/knowledge", {
    ...adminH(pwd),
    params: { q, language, confidence, limit },
  });
  return data;
}
export async function teachingDeleteKnowledge(pwd, id) {
  const { data } = await api.delete(`/admin/teaching/knowledge/${id}`, adminH(pwd));
  return data;
}
export async function teachingUpsertCorrection(pwd, payload) {
  const { data } = await api.post("/admin/teaching/corrections", payload, adminH(pwd));
  return data;
}
export async function teachingListCorrections(pwd) {
  const { data } = await api.get("/admin/teaching/corrections", adminH(pwd));
  return data;
}
export async function teachingDeleteCorrection(pwd, id) {
  const { data } = await api.delete(`/admin/teaching/corrections/${id}`, adminH(pwd));
  return data;
}
export async function teachingStats(pwd) {
  const { data } = await api.get("/admin/teaching/stats", adminH(pwd));
  return data;
}
export async function kbLookup(q, language) {
  const { data } = await api.get("/kb/lookup", { params: { q, language } });
  return data;
}
