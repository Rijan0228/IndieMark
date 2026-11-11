(function(r){
  "use strict";

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);

  const dateLabel = value => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  };

  const hashLabel = value => value
    ? '<code>' + escapeHTML(value) + '</code>'
    : "Not recorded";

  r.ReportGenerator = {
    summary(records = []) {
      return {
        total: records.length,
        sent: records.filter(x => x.status === "sent").length,
        prepared: records.filter(x => x.status !== "sent").length,
        watermarked: records.filter(x => x.watermarkStatus === "embedded_experimental").length
      };
    },

    toJSON(records = []) {
      return JSON.stringify({
        generatedAt: new Date().toISOString(),
        summary: this.summary(records),
        records
      }, null, 2);
    },

    toHTML({ records = [], recipients = [], cases = [] } = {}) {
      const summary = this.summary(records);
      const recipientById = new Map(recipients.map(item => [item.id, item.name]));
      const caseRows = [...cases].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const recordRows = [...records].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const statusLabel = value => value === "sent" ? "Confirmed sent" : "Prepared";
      const resultLabel = value => ({
        watermark_recovered_match: "Watermark recovered · local record matched",
        watermark_recovered_unmatched: "Watermark recovered · no local record",
        exact_hash_match: "Exact file hash matched",
        no_match: "No match"
      })[value] || "Recorded";

      const recordsHTML = recordRows.length ? recordRows.map(item => `
        <tr>
          <td><strong>${escapeHTML(item.assetName || item.fileName || "Untitled asset")}</strong><small>${escapeHTML(item.fileName || "")}</small></td>
          <td>${escapeHTML(item.recipientName || recipientById.get(item.recipientId) || "Unassigned")}</td>
          <td>${escapeHTML(dateLabel(item.createdAt))}</td>
          <td>${escapeHTML(statusLabel(item.status))}</td>
          <td>${item.watermarkStatus === "embedded_experimental" ? "Experimental watermark" : "Metadata only"}</td>
          <td>${hashLabel(item.watermarkedSha256 || item.sha256)}</td>
        </tr>`).join("") : '<tr><td colspan="6" class="empty">No distribution records were found.</td></tr>';

      const casesHTML = caseRows.length ? caseRows.map(item => `
        <tr>
          <td>${escapeHTML(item.fileName || "Unknown file")}</td>
          <td>${escapeHTML(resultLabel(item.result))}</td>
          <td>${escapeHTML(dateLabel(item.createdAt))}</td>
          <td>${hashLabel(item.sha256)}</td>
        </tr>`).join("") : '<tr><td colspan="4" class="empty">No investigations were recorded.</td></tr>';

      const generatedAt = new Date().toLocaleString();
      return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IndieMark Distribution & Evidence Report</title>
<style>
:root{color-scheme:light;--ink:#20232b;--muted:#697180;--line:#e5e8ee;--paper:#fff;--soft:#f5f7fa;--accent:#5948c7}
*{box-sizing:border-box}body{margin:0;background:#eef0f4;color:var(--ink);font:14px/1.55 Arial,sans-serif}
main{max-width:1100px;margin:32px auto;padding:0 20px}.sheet{background:var(--paper);padding:42px;border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 36px #20232b0d}
header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:24px}
.brand{font-weight:800;letter-spacing:.12em;color:var(--accent);font-size:12px}.eyebrow{font-size:10px;letter-spacing:.15em;color:var(--muted);font-weight:700;text-transform:uppercase}
h1{font-size:30px;line-height:1.15;margin:8px 0}h2{font-size:17px;margin:30px 0 12px}.muted,small{color:var(--muted)}.generated{text-align:right;color:var(--muted);font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.stat{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:16px}.stat b{display:block;font-size:26px}.stat span{font-size:10px;letter-spacing:.08em;color:var(--muted);font-weight:700}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase;background:var(--soft)}th,td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}td small{display:block;margin-top:3px}code{font-size:10px;overflow-wrap:anywhere}.empty{color:var(--muted);text-align:center;padding:22px}
.notice{background:#fbf8ef;border:1px solid #eee4c8;border-radius:10px;padding:16px;margin-top:26px}.notice b{display:block;margin-bottom:5px}.notice p{margin:0;color:#625b4a;font-size:12px}
footer{border-top:1px solid var(--line);margin-top:28px;padding-top:16px;color:var(--muted);font-size:11px}
.actions{display:flex;justify-content:flex-end;margin-bottom:14px}button{border:0;background:var(--accent);color:#fff;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer}
@media(max-width:700px){.sheet{padding:22px}.stats{grid-template-columns:repeat(2,1fr)}header{display:block}.generated{text-align:left;margin-top:12px}h1{font-size:25px}}
@media print{body{background:#fff}.actions{display:none}main{max-width:none;margin:0;padding:0}.sheet{border:0;border-radius:0;box-shadow:none;padding:0}thead{display:table-header-group}tr{break-inside:avoid}}
</style></head><body><main><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div><article class="sheet">
<header><div><div class="brand">INDIEMARK</div><h1>Distribution & Evidence Report</h1><div class="muted">Local workspace activity summary</div></div><div class="generated">Generated<br><strong>${escapeHTML(generatedAt)}</strong></div></header>
<section class="stats">
<div class="stat"><b>${summary.total}</b><span>DISTRIBUTION RECORDS</span></div>
<div class="stat"><b>${summary.sent}</b><span>CONFIRMED SENT</span></div>
<div class="stat"><b>${summary.prepared}</b><span>PREPARED</span></div>
<div class="stat"><b>${summary.watermarked}</b><span>EXPERIMENTAL WATERMARKS</span></div>
</section>
<h2>Distribution register</h2><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Recipient</th><th>Created</th><th>Status</th><th>Protection</th><th>Recorded SHA-256</th></tr></thead><tbody>${recordsHTML}</tbody></table></div>
<h2>Investigation history</h2><div class="table-wrap"><table><thead><tr><th>Suspected file</th><th>Result</th><th>Checked</th><th>SHA-256</th></tr></thead><tbody>${casesHTML}</tbody></table></div>
<div class="notice"><b>Important limitations</b><p>This report is generated from records stored in this browser. It is an activity summary, not a certified forensic report, cryptographic signature, legal finding, or proof of who created, sent, received, or published a file. Experimental watermark recovery and exact hash matches are technical indicators only. A missing match does not prove a file was never watermarked. The report does not include original media or saved protected-file contents.</p></div>
<footer>IndieMark · Local-first workspace · Report generated on this device · Keep the original files and independent evidence separately.</footer>
</article></main></body></html>`;
    }
  };
})(globalThis.IndieMarkModules = globalThis.IndieMarkModules || {});
