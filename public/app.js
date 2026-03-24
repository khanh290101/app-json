import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBU77nQxdnt6R99RNYzofblnZsIpVI1JtA",
  authDomain: "app-json-c242a.firebaseapp.com",
  projectId: "app-json-c242a",
  storageBucket: "app-json-c242a.firebasestorage.app",
  messagingSenderId: "93412268713",
  appId: "1:93412268713:web:acbe975b3e0118b70067b8",
  measurementId: "G-4BHCH2DXP4",
};

const COLLECTION_NAME = "named_json_store";

const firebaseApp = initializeApp(firebaseConfig);
getAnalytics(firebaseApp);
const db = getFirestore(firebaseApp);
const collectionRef = collection(db, COLLECTION_NAME);

const state = {
  items: [],
  selectedId: null,
};

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  bindRefs();
  bindEvents();
  initializeAppUi();
});

function bindRefs() {
  refs.tableBody = document.getElementById("tableBody");
  refs.listMeta = document.getElementById("listMeta");
  refs.searchInput = document.getElementById("searchInput");
  refs.clearSearchBtn = document.getElementById("clearSearchBtn");
  refs.newItemBtn = document.getElementById("newItemBtn");
  refs.exportBtn = document.getElementById("exportBtn");
  refs.importBtn = document.getElementById("importBtn");
  refs.importInput = document.getElementById("importInput");
  refs.itemForm = document.getElementById("itemForm");
  refs.nameInput = document.getElementById("nameInput");
  refs.contentInput = document.getElementById("contentInput");
  refs.modeBadge = document.getElementById("modeBadge");
  refs.contentHint = document.getElementById("contentHint");
  refs.deleteBtn = document.getElementById("deleteBtn");
  refs.resetBtn = document.getElementById("resetBtn");
  refs.copyContentBtn = document.getElementById("copyContentBtn");
  refs.copyRecordBtn = document.getElementById("copyRecordBtn");
  refs.statusText = document.getElementById("statusText");
  refs.statusBar = refs.statusText.closest(".status-bar");
  refs.typeInputs = [...document.querySelectorAll('input[name="contentType"]')];
}

function bindEvents() {
  refs.searchInput.addEventListener("input", renderTable);
  refs.clearSearchBtn.addEventListener("click", clearSearch);
  refs.newItemBtn.addEventListener("click", resetForm);
  refs.resetBtn.addEventListener("click", resetForm);
  refs.itemForm.addEventListener("submit", onSubmitForm);
  refs.deleteBtn.addEventListener("click", deleteSelectedItem);
  refs.copyContentBtn.addEventListener("click", () => copySelected("content"));
  refs.copyRecordBtn.addEventListener("click", () => copySelected("record"));
  refs.exportBtn.addEventListener("click", exportJsonFile);
  refs.importBtn.addEventListener("click", () => refs.importInput.click());
  refs.importInput.addEventListener("change", importJsonFile);

  refs.typeInputs.forEach((input) => {
    input.addEventListener("change", updateContentHint);
  });

  refs.tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const { id, action } = button.dataset;
    if (!id || !action) {
      return;
    }

    if (action === "copy") {
      state.selectedId = id;
      copySelected("content");
      renderTable();
      return;
    }

    if (action === "edit") {
      selectItemForEdit(id);
      return;
    }

    if (action === "delete") {
      deleteItemById(id);
    }
  });
}

function initializeAppUi() {
  updateContentHint();
  resetForm(false);
  subscribeToItems();
}

function subscribeToItems() {
  const itemsQuery = query(collectionRef, orderBy("updated_at", "desc"));
  onSnapshot(
    itemsQuery,
    (snapshot) => {
      state.items = snapshot.docs.map((entry) => normalizeDoc(entry));
      render();
      if (state.items.length === 0) {
        setStatus("Chưa có dữ liệu trên Firestore. Bạn có thể tạo mới ngay.", "neutral");
      } else {
        setStatus(`Đã đồng bộ ${state.items.length} mục từ Firebase.`, "success");
      }
    },
    (error) => {
      setStatus(`Không thể kết nối Firestore: ${error.message}`, "error");
    },
  );
}

function normalizeDoc(entry) {
  const raw = entry.data() || {};
  let contentType = raw.content_type || "json";
  let content = raw.content;

  if (contentType === "string") {
    contentType = "json";
    try {
      content = JSON.parse(content);
    } catch {
      content = { value: String(content ?? "") };
    }
  }

  if (contentType !== "list") {
    contentType = "json";
  }

  return {
    id: entry.id,
    name: String(raw.name || "").trim(),
    content_type: contentType,
    content,
    updated_at: Number(raw.updated_at || Date.now()),
  };
}

function render() {
  renderTable();
  updateModeBadge();
}

function renderTable() {
  const items = getFilteredItems();
  refs.listMeta.textContent = `${items.length} mục hiển thị / ${state.items.length} mục lưu trữ`;

  if (items.length === 0) {
    refs.tableBody.innerHTML = `
      <tr>
        <td class="empty-state" colspan="5">Không có dữ liệu phù hợp.</td>
      </tr>
    `;
    return;
  }

  refs.tableBody.innerHTML = items
    .map((item, index) => {
      const isSelected = item.id === state.selectedId;
      return `
        <tr ${isSelected ? 'data-selected="true"' : ""}>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td><span class="badge">${item.content_type === "json" ? "JSON" : "Mảng JSON"}</span></td>
          <td><div class="content-preview">${escapeHtml(previewContent(item.content))}</div></td>
          <td>
            <div class="actions">
              <button class="btn btn-secondary" type="button" data-id="${item.id}" data-action="copy">Sao chép</button>
              <button class="btn btn-ghost" type="button" data-id="${item.id}" data-action="edit">Sửa</button>
              <button class="btn btn-danger" type="button" data-id="${item.id}" data-action="delete">Xoá</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function getFilteredItems() {
  const keyword = refs.searchInput.value.trim().toLowerCase();
  if (!keyword) {
    return [...state.items];
  }
  return state.items.filter((item) => item.name.toLowerCase().includes(keyword));
}

function updateContentHint() {
  if (getSelectedType() === "list") {
    refs.contentHint.textContent = 'Nhập mảng JSON, ví dụ: [{"id": 1}, {"id": 2}]';
    return;
  }
  refs.contentHint.textContent = 'Nhập JSON object, ví dụ: {"id": 1, "name": "abc"}';
}

function updateModeBadge() {
  refs.modeBadge.textContent = state.selectedId ? "Đang sửa mục đã chọn" : "Đang tạo mới";
}

async function onSubmitForm(event) {
  event.preventDefault();

  const name = refs.nameInput.value.trim();
  const rawContent = refs.contentInput.value.trim();
  const contentType = getSelectedType();

  if (!name) {
    setStatus("Bạn cần nhập tên.", "error");
    refs.nameInput.focus();
    return;
  }

  const duplicate = state.items.find(
    (item) => item.name.trim().toLowerCase() === name.toLowerCase() && item.id !== state.selectedId,
  );
  if (duplicate) {
    setStatus("Tên đã tồn tại. Hãy dùng tên khác.", "error");
    refs.nameInput.focus();
    return;
  }

  const parsed = parseContent(rawContent, contentType);
  if (!parsed.ok) {
    setStatus(parsed.message, "error");
    refs.contentInput.focus();
    return;
  }

  try {
    const isUpdate = Boolean(state.selectedId);
    const docRef = isUpdate ? doc(db, COLLECTION_NAME, state.selectedId) : doc(collectionRef);
    await setDoc(
      docRef,
      {
        name,
        content_type: contentType,
        content: parsed.value,
        updated_at: Date.now(),
      },
      { merge: true },
    );

    state.selectedId = docRef.id;
    setStatus(isUpdate ? `Đã lưu "${name}" lên Firebase.` : `Đã thêm "${name}".`, "success");
  } catch (error) {
    setStatus(`Không thể lưu dữ liệu: ${error.message}`, "error");
  }
}

function parseContent(rawContent, contentType) {
  const fallback = contentType === "list" ? "[]" : "{}";

  let parsed;
  try {
    parsed = JSON.parse(rawContent || fallback);
  } catch (error) {
    return {
      ok: false,
      message: `JSON không hợp lệ: ${error.message}`,
    };
  }

  if (contentType === "list" && !Array.isArray(parsed)) {
    return {
      ok: false,
      message: "Nội dung phải là mảng JSON.",
    };
  }

  if (contentType === "json" && (!parsed || Array.isArray(parsed) || typeof parsed !== "object")) {
    return {
      ok: false,
      message: "Nội dung phải là JSON object.",
    };
  }

  return { ok: true, value: parsed };
}

function deleteSelectedItem() {
  if (!state.selectedId) {
    setStatus("Hãy chọn một mục để xoá.", "error");
    return;
  }
  deleteItemById(state.selectedId);
}

async function deleteItemById(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    setStatus("Không tìm thấy mục cần xoá.", "error");
    return;
  }

  const confirmed = window.confirm(`Bạn có chắc muốn xoá "${item.name}"?`);
  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    if (state.selectedId === id) {
      resetForm();
    }
    setStatus(`Đã xoá "${item.name}" khỏi Firebase.`, "success");
  } catch (error) {
    setStatus(`Không thể xoá dữ liệu: ${error.message}`, "error");
  }
}

function selectItemForEdit(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    setStatus("Không tìm thấy mục để sửa.", "error");
    return;
  }

  state.selectedId = id;
  refs.nameInput.value = item.name;
  setSelectedType(item.content_type);
  refs.contentInput.value = JSON.stringify(item.content, null, 2);
  updateContentHint();
  render();
  refs.nameInput.focus();
  setStatus(`Đang sửa "${item.name}".`, "neutral");
}

async function copySelected(mode) {
  const item = state.items.find((entry) => entry.id === state.selectedId);
  if (!item) {
    setStatus("Hãy chọn một mục để sao chép.", "error");
    return;
  }

  const text =
    mode === "record"
      ? JSON.stringify(
          {
            name: item.name,
            content_type: item.content_type,
            content: item.content,
          },
          null,
          2,
        )
      : JSON.stringify(item.content, null, 2);

  const copied = await copyText(text);
  if (!copied) {
    setStatus("Không thể sao chép vào clipboard trên trình duyệt này.", "error");
  }
}

function exportJsonFile() {
  const exportPayload = state.items.map((item) => ({
    id: item.id,
    name: item.name,
    content_type: item.content_type,
    content: item.content,
    updated_at: item.updated_at,
  }));

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "named_json_store.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Đã xuất file JSON từ Firebase.", "success");
}

async function importJsonFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const rawText = await file.text();
    const data = JSON.parse(rawText);
    const normalized = normalizeImportedItems(data);

    const batch = writeBatch(db);
    normalized.forEach((item) => {
      batch.set(doc(db, COLLECTION_NAME, item.id), item);
    });
    await batch.commit();

    resetForm();
    setStatus(`Đã nhập ${normalized.length} mục lên Firebase.`, "success");
  } catch (error) {
    setStatus(`Không thể nhập file JSON: ${error.message}`, "error");
  } finally {
    refs.importInput.value = "";
  }
}

function normalizeImportedItems(data) {
  if (!Array.isArray(data)) {
    throw new Error("File JSON phải là một mảng dữ liệu.");
  }

  const normalized = data
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return null;
      }

      const name = String(row.name || "").trim();
      let contentType = row.content_type || "json";
      let content = row.content;

      if (contentType === "string") {
        contentType = "json";
        try {
          content = JSON.parse(content);
        } catch {
          content = { value: String(content ?? "") };
        }
      }

      if (!name || !["json", "list"].includes(contentType)) {
        return null;
      }

      if (contentType === "json" && (!content || Array.isArray(content) || typeof content !== "object")) {
        return null;
      }

      if (contentType === "list" && !Array.isArray(content)) {
        return null;
      }

      return {
        id: String(row.id || buildId()),
        name,
        content_type: contentType,
        content,
        updated_at: Number(row.updated_at || Date.now()),
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new Error("Không có mục hợp lệ trong file nhập.");
  }

  return normalized;
}

function resetForm(shouldRender = true) {
  state.selectedId = null;
  refs.itemForm.reset();
  setSelectedType("json");
  refs.nameInput.value = "";
  refs.contentInput.value = "";
  updateContentHint();
  if (shouldRender) {
    render();
  } else {
    updateModeBadge();
  }
}

function clearSearch() {
  refs.searchInput.value = "";
  renderTable();
}

function getSelectedType() {
  return refs.typeInputs.find((input) => input.checked)?.value || "json";
}

function setSelectedType(type) {
  refs.typeInputs.forEach((input) => {
    input.checked = input.value === type;
  });
}

function previewContent(content) {
  const raw = JSON.stringify(content, null, 2);
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

function setStatus(message, tone = "neutral") {
  refs.statusText.textContent = message;
  refs.statusBar.classList.remove("is-error", "is-success");
  if (tone === "error") {
    refs.statusBar.classList.add("is-error");
  }
  if (tone === "success") {
    refs.statusBar.classList.add("is-success");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

function buildId() {
  if (window.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `json-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
