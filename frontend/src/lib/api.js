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
