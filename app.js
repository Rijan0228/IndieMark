
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
  if (globalThis.IndieMark?.WatermarkCore) {
    return globalThis.IndieMark.WatermarkCore.createId();
  }

  const randomBytes = new Uint8Array(6);

  crypto.getRandomValues(randomBytes);

  const hex = Array.from(randomBytes)
    .map(x => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return "IM-" + hex.match(/.{1,4}/g).join("-");
}

async function sha256(file) {
  const fingerprint = globalThis.IndieMarkModules?.Fingerprint;
  if (fingerprint) return fingerprint.sha256(file);
  const data = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
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

$("quickRecipientAdd").addEventListener("click", async () => {
  const name = $("quickRecipientName").value.trim();
  if (!name) {
    showToast("Enter a recipient name first");
    $("quickRecipientName").focus();
    return;
  }
  const recipient = { id: makeId(), name, note: "Added from Watermark Studio", createdAt: nowISO() };
  await put("recipients", recipient);
  await refresh();
  $("recipientSelect").value = recipient.id;
  $("quickRecipientName").value = "";
  showToast("Recipient added and selected");
});
$("quickRecipientName").addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); $("quickRecipientAdd").click(); }
});

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
    showToast("Choose a media file first");
    $("mediaInput").click();
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

  const originalHash = await sha256(selectedMedia);
  const distributionId = makeId();
  const createdAt = nowISO();
  const assetName = $("assetName").value.trim();
  const label = $("customLabel").value.trim();

  let exportedFile = null;
  let watermarkStatus = "not_supported";
  let watermarkedHash = null;

  if (selectedMedia.type.startsWith("audio/")) {
    const core = globalThis.IndieMark?.WatermarkCore;
    const audioEngine = globalThis.IndieMark?.AudioEngine;
    if (selectedMedia.type === "audio/wav" || /\.wav$/i.test(selectedMedia.name)) {
      if (!core || !audioEngine) {
        showToast("Audio engine did not load. Refresh and try again.");
        return;
      }
      try {
        const payload = core.createPayload({ id: distributionId, label, createdAt });
        const result = await audioEngine.embed(selectedMedia, payload);
        exportedFile = result.blob;
        watermarkedHash = await sha256(exportedFile);
        watermarkStatus = "embedded_experimental";
      } catch (error) {
        showToast("WAV watermarking failed: " + error.message);
        return;
      }
    }
  }

  if (selectedMedia.type.startsWith("image/")) {
    const core = globalThis.IndieMark?.WatermarkCore;
    const imageEngine = globalThis.IndieMark?.ImageEngine;

    if (!core || !imageEngine) {
      showToast("Image engine did not load. Refresh and try again.");
      return;
    }

    try {
      const payload = core.createPayload({
        id: distributionId,
        label,
        createdAt
      });

      const result = await imageEngine.embed(selectedMedia, payload);
      exportedFile = result.blob;
      watermarkedHash = await sha256(exportedFile);
      watermarkStatus = "embedded_experimental";
    } catch (error) {
      showToast("Watermarking failed: " + error.message);
      return;
    }
  }

  const record = {
    id: distributionId,

    recipientId: recipient.id,
    recipientName: recipient.name,

    fileName: selectedMedia.name,
    fileSize: selectedMedia.size,
    mimeType: selectedMedia.type,

    assetName,
    label,

    sha256: originalHash,
    watermarkedSha256: watermarkedHash,

    createdAt,
    sentAt: null,

    status: "prepared",

    watermarkStatus,
    watermarkMethod: watermarkStatus === "embedded_experimental"
      ? (selectedMedia.type.startsWith("audio/") ? "experimental-pcm-lsb" : "experimental-lsb")
      : null
  };

  await put("records", record);

  if (exportedFile) {
    const safeBaseName = (selectedMedia.name.replace(/\\.[^.]+$/, "") || "media")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .slice(0, 60);

    const url = URL.createObjectURL(exportedFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeBaseName + (selectedMedia.type.startsWith("audio/") ? "-indiemark.wav" : "-indiemark.png");
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  await refresh();

  showToast(
    exportedFile
      ? "Watermarked copy downloaded. Next: open Leak Detector to verify it."
      : "Record saved. This format is currently metadata-only."
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

    let recovered = null;
    let recoveryError = null;

    if (suspectFile.type.startsWith("image/") || suspectFile.type === "audio/wav" || /\.wav$/i.test(suspectFile.name)) {
      try {
        const isWav = suspectFile.type === "audio/wav" || /\.wav$/i.test(suspectFile.name);
        const mediaEngine = isWav ? globalThis.IndieMark?.AudioEngine : globalThis.IndieMark?.ImageEngine;
        if (mediaEngine) {
          const result = await mediaEngine.extract(suspectFile);
          if (result.found && result.verified) {
            recovered = result.payload;
          } else {
            recoveryError = result.reason || "No compatible watermark found.";
          }
        } else {
          recoveryError = "Matching media engine did not load.";
        }
      } catch (error) {
        recoveryError = error.message;
      }
    }

    const watermarkMatch = recovered
      ? records.find(record => record.id === recovered.id)
      : null;

    const exactMatch = records.find(record =>
      record.sha256 === hash || record.watermarkedSha256 === hash
    );

    const match = watermarkMatch || exactMatch;
    const box = $("detectorResult");
    box.classList.remove("hidden", "mismatch");

    if (recovered && watermarkMatch) {
      box.innerHTML = `
        <b>Experimental watermark recovered and matched.</b>
        <br>
        Distribution ID: ${escapeHTML(recovered.id)}
        <br>
        Recipient record: ${escapeHTML(watermarkMatch.recipientName)}
        <br>
        Asset: ${escapeHTML(watermarkMatch.assetName || watermarkMatch.fileName)}
        <br>
        Method: experimental PNG LSB
        <br><br>
        The payload checksum is valid and the ID matches a record in this browser.
        This is not a cryptographic signature and does not prove who published the file.
      `;
    } else if (recovered) {
      box.classList.add("mismatch");
      box.innerHTML = `
        <b>A compatible watermark payload was recovered, but no matching local record exists.</b>
        <br>
        Recovered ID: ${escapeHTML(recovered.id)}
        <br>
        Label: ${escapeHTML(recovered.label || "None")}
        <br><br>
        The checksum is an accidental-corruption check, not proof of authenticity or identity.
      `;
    } else if (exactMatch) {
      box.innerHTML = `
        <b>Exact file match found in your local register.</b>
        <br>
        Distribution ID: ${escapeHTML(exactMatch.id)}
        <br>
        Recipient record: ${escapeHTML(exactMatch.recipientName)}
        <br>
        File: ${escapeHTML(exactMatch.fileName)}
        <br><br>
        This is a SHA-256 file match, not a recovered watermark or proof of who published it.
      `;
    } else {
      box.classList.add("mismatch");
      box.innerHTML = `
        <b>No watermark or exact file match was found.</b>
        <br>
        File fingerprint: <code>${escapeHTML(hash)}</code>
        <br><br>
        ${escapeHTML(recoveryError || "No compatible watermark was detected.")}
        A failed recovery does not prove that the image has never been watermarked.
      `;
    }

    await put("cases", {
      id: crypto.randomUUID(),
      fileName: suspectFile.name,
      sha256: hash,
      result: recovered
        ? (watermarkMatch ? "watermark_recovered_match" : "watermark_recovered_unmatched")
        : (exactMatch ? "exact_hash_match" : "no_match"),
      matchedRecordId: match?.id || null,
      recoveredDistributionId: recovered?.id || null,
      createdAt: nowISO()
    });

    await refresh();

  } catch (error) {
    showToast("Could not analyze this file: " + error.message);
  }

  button.disabled = false;
  button.innerHTML = 'Analyze file <span>→</span>';
});


/* --------------------------------------------------
   EXPORT LOCAL BACKUP
-------------------------------------------------- */

/* RESILIENCE LAB */
let labFile = null;

$("labInput").addEventListener("change", event => {
  labFile = event.target.files[0] || null;
  $("runLab").disabled = !labFile;
  $("labResults").innerHTML = "";
  $("labSummary").textContent = "Ready to run";
  $("labBaseline").textContent = "Baseline check has not run.";
  $("labFileMeta").textContent = labFile ? `${labFile.name} · ${bytes(labFile.size)}` : "No test image selected";
  $("labStatus").textContent = labFile ? "IMAGE SELECTED" : "READY FOR TESTING";
});

function labCanvasBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create transformed image.")), type, quality));
}

async function labTransform(file, mode) {
  const bitmap = await createImageBitmap(file);
  let sx=0, sy=0, sw=bitmap.width, sh=bitmap.height;
  let width=bitmap.width, height=bitmap.height, type="image/png", quality;
  if(mode==="resize"){width=Math.max(1,Math.round(bitmap.width*.75));height=Math.max(1,Math.round(bitmap.height*.75));}
  if(mode==="crop"){sw=Math.max(1,Math.round(bitmap.width*.9));sh=Math.max(1,Math.round(bitmap.height*.9));sx=Math.floor((bitmap.width-sw)/2);sy=Math.floor((bitmap.height-sh)/2);width=sw;height=sh;}
  if(mode==="jpeg"){type="image/jpeg";quality=.82;}
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx){bitmap.close();throw new Error("Canvas is unavailable.");}
  if(mode==="brightness")ctx.filter="brightness(1.12) contrast(1.04)";
  if(mode==="grayscale")ctx.filter="grayscale(1)";
  if(mode==="combined")ctx.filter="brightness(1.08) contrast(1.03)";
  ctx.drawImage(bitmap,sx,sy,sw,sh,0,0,width,height);bitmap.close();
  if(mode==="combined"){
    const small=document.createElement("canvas");small.width=Math.max(1,Math.round(width*.8));small.height=Math.max(1,Math.round(height*.8));
    small.getContext("2d").drawImage(canvas,0,0,small.width,small.height);
    return labCanvasBlob(small,"image/jpeg",.82);
  }
  return labCanvasBlob(canvas,type,quality);
}

function labCard(name, detail, state, note) {
  const cls=state==="recovered"?"good":state==="different"?"warn":"bad";
  const label=state==="recovered"?"RECOVERED":state==="different"?"DIFFERENT ID":"NOT RECOVERED";
  return `<article class="panel lab-result-card"><div class="lab-result-top"><div><b>${escapeHTML(name)}</b><small>${escapeHTML(detail)}</small></div><span class="lab-result-status ${cls}">${label}</span></div><p>${escapeHTML(note)}</p></article>`;
}

$("runLab").addEventListener("click", async () => {
  if(!labFile)return;
  const button=$("runLab");button.disabled=true;button.textContent="Checking baseline…";
  $("labStatus").textContent="RUNNING";$("labBaseline").textContent="Checking original watermark…";$("labResults").innerHTML="";
  try{
    const engine=globalThis.IndieMark?.ImageEngine;
    if(!engine)throw new Error("Image engine did not load.");
    const baseline=await engine.extract(labFile);
    if(!baseline.found||!baseline.payload?.id){
      $("labBaseline").textContent="Baseline failed: no recoverable IndieMark prototype watermark was found.";
      $("labStatus").textContent="BASELINE FAILED";$("labSummary").textContent="No transformation tests were run";
      showToast("Choose a valid watermarked PNG first");return;
    }
    const id=baseline.payload.id;
    $("labBaseline").textContent="Baseline passed · ID "+id+" · checksum valid (not creator authentication)";
    const tests=[
      ["Lossless PNG re-export","Canvas re-render · PNG","png"],
      ["JPEG compression","JPEG · quality 82%","jpeg"],
      ["Image resizing","75% dimensions · PNG","resize"],
      ["Center crop","90% center crop · PNG","crop"],
      ["Brightness & contrast","Brightness 112% · contrast 104%","brightness"],
      ["Grayscale conversion","Grayscale filter · PNG","grayscale"],
      ["Combined processing","Brightness · resize · JPEG","combined"]
    ];
    const cards=[];
    for(let i=0;i<tests.length;i++){
      const [name,detail,mode]=tests[i];button.textContent=`Testing ${i+1} of ${tests.length}…`;
      try{
        const transformed=await labTransform(labFile,mode);
        const result=await engine.extract(transformed);
        if(result.found&&result.payload?.id===id)cards.push(labCard(name,detail,"recovered","The baseline distribution ID was recovered."));
        else if(result.found)cards.push(labCard(name,detail,"different","A payload was detected, but its ID did not match the baseline."));
        else cards.push(labCard(name,detail,"failed",result.reason||"No valid payload was recovered."));
      }catch(error){cards.push(labCard(name,detail,"failed",error.message||"Transformation or extraction failed."));}
      $("labResults").innerHTML=cards.join("");
    }
    const count=cards.filter(card=>card.includes("RECOVERED")).length;
    $("labSummary").textContent=`${count} of ${tests.length} transformations recovered the baseline ID`;
    $("labStatus").textContent="TESTS COMPLETE";
  }catch(error){
    $("labBaseline").textContent="Test error: "+error.message;$("labStatus").textContent="TEST ERROR";showToast("Lab error: "+error.message);
  }finally{button.disabled=!labFile;button.innerHTML='Run tests again <span>↻</span>';}
});


async function exportData() {
  const data = {
    product: "IndieMark",
    formatVersion: 1,

    exportedAt: nowISO(),

    notice:
      "Local metadata backup only. Does not contain original media files. It includes distribution metadata and recorded hashes.",

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
