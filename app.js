
/* IndieMark v0.1 — local-first workspace foundation.
   No watermark is embedded or recovered in this version. */

const DB_NAME = "IndieMarkLocal";
const DB_VERSION = 1;

let db;
let selectedMedia = null;
let suspectFile = null;
let previewUrl = null;
let toastTimer;

const $ = (id) => document.getElementById(id);

const nowISO = () => new Date().toISOString();

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

const bytes = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(2)} MB`;


/* --------------------------------------------------
   NOTIFICATIONS
-------------------------------------------------- */

function showToast(message) {
  const el = $("toast");

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}


/* --------------------------------------------------
   LOCAL DATABASE
-------------------------------------------------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const d = request.result;

      if (!d.objectStoreNames.contains("records")) {
        d.createObjectStore("records", {
          keyPath: "id"
        });
      }

      if (!d.objectStoreNames.contains("recipients")) {
        d.createObjectStore("recipients", {
          keyPath: "id"
        });
      }

      if (!d.objectStoreNames.contains("cases")) {
        d.createObjectStore("cases", {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => reject(request.error);
  });
}

function store(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function all(name) {
  return new Promise((resolve, reject) => {
    const request = store(name).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(name, value) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").put(value);

    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function remove(name, key) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").delete(key);

    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function clearStore(name) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").clear();

    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}


/* --------------------------------------------------
   IDENTIFIERS AND FILE FINGERPRINTS
-------------------------------------------------- */

function makeId() {
  const randomBytes = new Uint8Array(6);

  crypto.getRandomValues(randomBytes);

  const hex = Array.from(randomBytes)
    .map(x => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return "IM-" + hex.match(/.{1,4}/g).join("-");
}

async function sha256(file) {
  const data = await file.arrayBuffer();

  const digest = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}


/* --------------------------------------------------
   PAGE NAVIGATION
-------------------------------------------------- */

function go(page) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.toggle(
      "active",
      p.id === `page-${page}`
    );
  });

  document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  const active = document.querySelector(
    `.nav-item[data-page="${page}"]`
  );

  $("pageCrumb").textContent = active
    ? active.textContent.trim()
    : "Command Center";

  $("sidebar").classList.remove("open");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    go(button.dataset.page);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    go(button.dataset.go);
  });
});

$("mobileMenu").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

$("dismissNotice").addEventListener("click", () => {
  const notice = document.querySelector(".notice");

  if (notice) {
    notice.remove();
  }
});


/* --------------------------------------------------
   MEDIA PREVIEW
-------------------------------------------------- */

function setMedia(file) {
  selectedMedia = file;

  $("fileInfo").textContent =
    `${file.name} · ${bytes(file.size)} · ${file.type || "Unknown format"}`;

  $("createRecord").disabled = false;

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);

  const stage = $("previewStage");

  stage.innerHTML = "";

  let node;

  if (file.type.startsWith("image/")) {
    node = document.createElement("img");
    node.alt = "Selected media preview";

  } else if (file.type.startsWith("video/")) {
    node = document.createElement("video");
    node.controls = true;

  } else if (file.type.startsWith("audio/")) {
    node = document.createElement("audio");
    node.controls = true;

  } else {
    stage.textContent =
      "Preview is not available for this file type.";

    return;
  }

  node.src = previewUrl;

  stage.appendChild(node);

  $("previewHash").textContent = "Calculating…";

  sha256(file)
    .then(hash => {
      $("previewHash").textContent = hash;
    })
    .catch(() => {
      $("previewHash").textContent = "Unavailable";
    });
}

$("mediaInput").addEventListener("change", event => {
  const file = event.target.files[0];

  if (file) {
    setMedia(file);
  }
});

const dz = $("dropzone");

["dragenter", "dragover"].forEach(eventName => {
  dz.addEventListener(eventName, event => {
    event.preventDefault();
    dz.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach(eventName => {
  dz.addEventListener(eventName, event => {
    event.preventDefault();
    dz.classList.remove("dragover");
  });
});

dz.addEventListener("drop", event => {
  const file = event.dataTransfer.files[0];

  if (file) {
    setMedia(file);
  }
});


/* --------------------------------------------------
   DASHBOARD REFRESH
-------------------------------------------------- */

async function refresh() {
  const [
    records,
    recipients,
    cases
  ] = await Promise.all([
    all("records"),
    all("recipients"),
    all("cases")
  ]);

  $("statRecords").textContent = records.length;

  $("statSent").textContent =
    records.filter(record => record.status === "sent").length;

  $("statRecipients").textContent = recipients.length;

  $("statCases").textContent = cases.length;

  const select = $("recipientSelect");
  const chosen = select.value;

  select.innerHTML =
    '<option value="">Choose or add a recipient below</option>' +
    recipients.map(recipient => `
      <option value="${escapeHTML(recipient.id)}">
        ${escapeHTML(recipient.name)}
      </option>
    `).join("");

  select.value = chosen;

  renderRows(records);
  renderRecipients(recipients, records);
}


/* --------------------------------------------------
   RECORD STATUS
-------------------------------------------------- */

function statusHTML(status) {
  return `
    <span class="mini-status ${status === "sent" ? "sent" : ""}">
      ${status === "sent" ? "SENT" : "PREPARED"}
    </span>
  `;
}

function actionHTML(record) {
  if (record.status === "sent") {
    return `
      <span class="sent-date">
        ${fmtDate(record.sentAt)}
      </span>
    `;
  }

  return `
    <button
      class="mark-sent"
      data-mark-sent="${escapeHTML(record.id)}"
    >
      Mark sent
    </button>
  `;
}


/* --------------------------------------------------
   MARK A DISTRIBUTION AS SENT
-------------------------------------------------- */

function bindMarkSent() {
  document.querySelectorAll("[data-mark-sent]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.markSent;

      const records = await all("records");

      const record = records.find(item => item.id === id);

      if (!record || record.status === "sent") {
        return;
      }

      const confirmed = confirm(
        `Confirm that you sent this copy to ${record.recipientName}?`
      );

      if (!confirmed) {
        return;
      }

      record.status = "sent";
      record.sentAt = nowISO();

      await put("records", record);

      await refresh();

      showToast("Delivery manually confirmed");
    });
  });
}


/* --------------------------------------------------
   RENDER DISTRIBUTION RECORDS
-------------------------------------------------- */

function renderRows(records) {
  const recent = [...records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const html = recent.map(record => `
    <div class="data-row">
      <code>${escapeHTML(record.id)}</code>

      <span>
        ${escapeHTML(record.assetName || record.fileName)}
      </span>

      <span>
        ${escapeHTML(record.recipientName)}
      </span>

      <span>
        ${fmtDate(record.createdAt)}
      </span>

      ${statusHTML(record.status)}

      <span>
        ${actionHTML(record)}
      </span>
    </div>
  `).join("");

  $("recentRows").classList.toggle(
    "empty-state",
    records.length === 0
  );

  $("recentRows").innerHTML = html || `
    <div class="empty-icon">▤</div>
    <b>No distribution records yet</b>
    <p>Your records will appear here when you add your first item.</p>
    <button class="button secondary" data-go="studio">
      Open workspace
    </button>
  `;

  const sortedRecords = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );

  $("vaultRows").innerHTML = records.length
    ? `
      <div class="table-head vault-head">
        <span>DISTRIBUTION ID</span>
        <span>ASSET</span>
        <span>RECIPIENT</span>
        <span>CREATED</span>
        <span>STATUS</span>
        <span></span>
      </div>

      ${sortedRecords.map(record => `
        <div class="data-row">
          <code>${escapeHTML(record.id)}</code>

          <span>
            ${escapeHTML(record.assetName || record.fileName)}
          </span>

          <span>
            ${escapeHTML(record.recipientName)}
          </span>

          <span>
            ${fmtDate(record.createdAt)}
          </span>

          ${statusHTML(record.status)}

          <span class="row-actions">
            ${actionHTML(record)}

            <button
              class="row-delete"
              data-delete-record="${escapeHTML(record.id)}"
              title="Delete record"
            >
              ×
            </button>
          </span>
        </div>
      `).join("")}
    `
    : `
      <div class="empty-state">
        <div class="empty-icon">▤</div>
        <b>Your vault is empty</b>
        <p>Create a distribution record in Watermark Studio.</p>
      </div>
    `;

  bindMarkSent();

  document.querySelectorAll("[data-delete-record]").forEach(button => {
    button.addEventListener("click", async () => {
      const confirmed = confirm(
        "Delete this distribution record?"
      );

      if (!confirmed) {
        return;
      }

      await remove("records", button.dataset.deleteRecord);

      await refresh();

      showToast("Record deleted");
    });
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      go(button.dataset.go);
    });
  });
}


/* --------------------------------------------------
   RECIPIENTS
-------------------------------------------------- */

function renderRecipients(recipients, records) {
  $("recipientList").innerHTML = recipients.length
    ? recipients.map(recipient => `
      <article class="recipient-card">
        <b>${escapeHTML(recipient.name)}</b>

        <p>
          ${escapeHTML(recipient.note || "No notes added")}
        </p>

        <small>
          ${records.filter(record =>
            record.recipientId === recipient.id
          ).length}
          distribution record(s)
        </small>
      </article>
    `).join("")
    : `
      <div class="empty-state">
        <b>No recipients added</b>
        <p>Add a recipient to create a distribution record.</p>
      </div>
    `;
}

$("addRecipient").addEventListener("click", async () => {
  const name = $("recipientName").value.trim();

  if (!name) {
    showToast("Enter a recipient name first");
    return;
  }

  await put("recipients", {
    id: crypto.randomUUID(),
    name,
    note: $("recipientNote").value.trim(),
    createdAt: nowISO()
  });

  $("recipientName").value = "";
  $("recipientNote").value = "";

  await refresh();

  showToast("Recipient added");
});


/* --------------------------------------------------
   CREATE DISTRIBUTION RECORD
-------------------------------------------------- */

$("createRecord").addEventListener("click", async () => {
  if (!selectedMedia) {
    return;
  }

  const recipientId = $("recipientSelect").value;

  if (!recipientId) {
    showToast("Add and select a recipient first");
    go("recipients");
    return;
  }

  const recipients = await all("recipients");

  const recipient = recipients.find(
    item => item.id === recipientId
  );

  if (!recipient) {
    showToast("Recipient could not be found");
    return;
  }

  const hash = await sha256(selectedMedia);

  const record = {
    id: makeId(),

    recipientId: recipient.id,
    recipientName: recipient.name,

    fileName: selectedMedia.name,
    fileSize: selectedMedia.size,
    mimeType: selectedMedia.type,

    assetName: $("assetName").value.trim(),
    label: $("customLabel").value.trim(),

    sha256: hash,

    createdAt: nowISO(),
    sentAt: null,

    status: "prepared",

    watermarkStatus: "not_embedded"
  };

  await put("records", record);

  await refresh();

  showToast(
    "Distribution record created — no watermark embedded"
  );

  $("assetName").value = "";
  $("customLabel").value = "";

  go("vault");
});


/* --------------------------------------------------
   LEAK DETECTOR
-------------------------------------------------- */

$("suspectInput").addEventListener("change", event => {
  suspectFile = event.target.files[0] || null;

  $("analyzeSuspect").disabled = !suspectFile;

  $("detectorResult").classList.add("hidden");
});

$("analyzeSuspect").addEventListener("click", async () => {
  if (!suspectFile) {
    return;
  }

  const button = $("analyzeSuspect");

  button.disabled = true;
  button.textContent = "Analyzing…";

  try {
    const hash = await sha256(suspectFile);

    const records = await all("records");

    const match = records.find(
      record => record.sha256 === hash
    );

    const box = $("detectorResult");

    box.classList.remove("hidden", "mismatch");

    if (match) {
      box.innerHTML = `
        <b>Exact file match found in your local register.</b>
        <br>

        Distribution ID:
        ${escapeHTML(match.id)}

        <br>

        Recipient record:
        ${escapeHTML(match.recipientName)}

        <br>

        File:
        ${escapeHTML(match.fileName)}

        <br><br>

        This is a SHA-256 file match, not a recovered watermark
        or proof of who published it.
      `;
    } else {
      box.classList.add("mismatch");

      box.innerHTML = `
        <b>No exact SHA-256 match in this browser's register.</b>

        <br>

        File fingerprint:
        ${hash}

        <br><br>

        This does not mean the file is unwatermarked.
        Watermark recovery is not implemented in this preview.
      `;
    }

    await put("cases", {
      id: crypto.randomUUID(),

      fileName: suspectFile.name,
      sha256: hash,

      result: match
        ? "exact_hash_match"
        : "no_exact_hash_match",

      matchedRecordId: match?.id || null,

      createdAt: nowISO()
    });

    await refresh();

  } catch (error) {
    showToast(
      "Could not analyze this file: " + error.message
    );
  }

  button.disabled = false;

  button.innerHTML = 'Analyze file <span>→</span>';
});


/* --------------------------------------------------
   EXPORT LOCAL BACKUP
-------------------------------------------------- */

async function exportData() {
  const data = {
    product: "IndieMark",
    formatVersion: 1,

    exportedAt: nowISO(),

    notice:
      "Local metadata backup only. Does not contain original media or embedded watermarks.",

    records: await all("records"),
    recipients: await all("recipients"),
    cases: await all("cases")
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    {
      type: "application/json"
    }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download =
    `indiemark-backup-${new Date().toISOString().slice(0, 10)}.json`;

  link.click();

  URL.revokeObjectURL(url);

  showToast("Backup exported");
}

$("exportBackup").addEventListener("click", exportData);
$("exportReport").addEventListener("click", exportData);
$("settingsExport").addEventListener("click", exportData);


/* --------------------------------------------------
   CLEAR LOCAL DATA
-------------------------------------------------- */

$("clearData").addEventListener("click", async () => {
  const confirmed = confirm(
    "This permanently deletes all IndieMark records, recipients and investigation entries saved in this browser. Export a backup first if needed. Continue?"
  );

  if (!confirmed) {
    return;
  }

  await Promise.all([
    clearStore("records"),
    clearStore("recipients"),
    clearStore("cases")
  ]);

  await refresh();

  showToast("Local workspace data cleared");
});


/* --------------------------------------------------
   START APPLICATION
-------------------------------------------------- */

(async () => {
  try {
    db = await openDB();

    await refresh();

  } catch (error) {
    console.error(error);

    showToast(
      "Local database unavailable. Use a modern browser and HTTPS."
    );
  }
})();
