import { CampaignData, Concept, TeamMessage } from "@/types/campaign";

export type ClientReportMode = "executive" | "technical";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(value: string | undefined, fallback = "Not provided"): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function splitLines(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toHtmlList(items: string[]): string {
  if (items.length === 0) {
    return `<p>${escapeHtml("Not provided")}</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function toHtmlListFromText(value: string | undefined): string {
  return toHtmlList(splitLines(value));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "Not provided";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function renderTable(headers: string[], rows: string[][]): string {
  const normalizedRows = rows.length > 0 ? rows : [headers.map(() => "Not provided")];
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${normalizedRows
          .map(
            (row) =>
              `<tr>${headers
                .map((_, index) => `<td>${escapeHtml(row[index] ?? "Not provided")}</td>`)
                .join("")}</tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function sortMessages(messages: TeamMessage[]): TeamMessage[] {
  return [...messages].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

function toPrototypeSection(concept: Concept): string {
  const board = concept.boardData;
  const barrierRows = board?.messageBarrierMap ?? [];
  const pretestQuestions = board?.pretestQuestions ?? [];
  const keyVisualDirections =
    board?.keyVisualDirections && board.keyVisualDirections.length > 0
      ? board.keyVisualDirections
      : [safeText(concept.keyVisualDescription)];
  const socialPosts = board?.socialPosts ?? [];
  const headlines = board?.headlines ?? [];
  const whatsappSequence = board?.whatsappSequence ?? [];
  const radioScript = safeText(board?.radioScript || concept.executionRationale);

  return `
    <article>
      <h4>${escapeHtml(concept.name)}</h4>
      <p><strong>Prototype status:</strong> ${escapeHtml(concept.status)}</p>
      <p><strong>Tagline / SMP:</strong> ${escapeHtml(safeText(concept.tagline || concept.smp))}</p>
      <h5>Key Visual Directions</h5>
      ${toHtmlList(keyVisualDirections)}
      <h5>Sample Copy Blocks</h5>
      <p><strong>Radio Script:</strong> ${escapeHtml(radioScript)}</p>
      <p><strong>Social Posts</strong></p>
      ${toHtmlList(socialPosts)}
      <p><strong>Headlines</strong></p>
      ${toHtmlList(headlines)}
      <p><strong>WhatsApp Sequence</strong></p>
      ${toHtmlList(whatsappSequence)}
      <h5>Message-to-Barrier Mapping</h5>
      ${renderTable(
        ["Barrier", "Message Strategy", "Channel"],
        barrierRows.map((row) => [row.barrier, row.strategy, row.channel]),
      )}
      <h5>Pretest Questions</h5>
      ${
        pretestQuestions.length > 0
          ? `<ol>${pretestQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ol>`
          : `<p>${escapeHtml("Not provided")}</p>`
      }
    </article>
  `;
}

export function buildClientReportHtml(
  data: CampaignData,
  options: { mode?: ClientReportMode } = {},
): string {
  const mode = options.mode || "technical";
  const selectedIdeas = data.ideas.filter((idea) => idea.selected);
  const statusCounts = data.concepts.reduce<Record<Concept["status"], number>>(
    (acc, concept) => {
      acc[concept.status] += 1;
      return acc;
    },
    { draft: 0, shortlisted: 0, final: 0 },
  );
  const generatedAt = new Date();
  const approvedRoles = (data.approvals || []).filter((entry) => entry.status === "approved");

  if (mode === "executive") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.campaign.name)} - Executive Client Summary</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; margin: 0; color: #0f172a; background: #f8fafc; }
      .page { margin: 18px auto; max-width: 940px; background: #fff; padding: 20px 24px; border: 1px solid #dbe2ea; box-sizing: border-box; }
      h1 { font-size: 24pt; margin: 0 0 10px; color: #0f4c81; }
      h2 { font-size: 14pt; margin: 16px 0 8px; color: #11497a; }
      p { margin: 5px 0; }
      ul { margin: 6px 0 10px 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #c8d3de; padding: 6px 7px; text-align: left; }
      th { background: #eff5fb; }
    </style>
  </head>
  <body>
    <section class="page">
      <h1>${escapeHtml(data.campaign.name)} - Executive Summary</h1>
      <p><strong>Country:</strong> ${escapeHtml(data.campaign.country)}</p>
      <p><strong>Reporting date:</strong> ${escapeHtml(generatedAt.toLocaleString())}</p>
      <p><strong>Campaign period:</strong> ${escapeHtml(formatDate(data.campaign.startDate))} to ${escapeHtml(formatDate(data.campaign.endDate))}</p>

      <h2>Strategic Summary</h2>
      <ul>
        <li><strong>Business objective:</strong> ${escapeHtml(safeText(data.businessObjective))}</li>
        <li><strong>Communication objective:</strong> ${escapeHtml(safeText(data.communicationObjective))}</li>
        <li><strong>Core insight:</strong> ${escapeHtml(safeText(data.insight.insightText))}</li>
        <li><strong>Primary behavior shift:</strong> ${escapeHtml(safeText(data.behavior.desiredBehavior))}</li>
      </ul>

      <h2>Execution Highlights</h2>
      <table>
        <thead><tr><th>Area</th><th>Highlights</th></tr></thead>
        <tbody>
          <tr><td>Communication Brief</td><td>${escapeHtml(`${data.audiences.length} audiences with message map and CTA planning.`)}</td></tr>
          <tr><td>Creative Brief</td><td>${escapeHtml(`${data.creativeBrief.deliverables.length} deliverables specified across channels.`)}</td></tr>
          <tr><td>4Rs Ideation</td><td>${escapeHtml(`${data.ideas.length} ideas generated, ${selectedIdeas.length} selected.`)}</td></tr>
          <tr><td>Concept Development</td><td>${escapeHtml(`${data.concepts.length} concepts (final: ${statusCounts.final}, shortlisted: ${statusCounts.shortlisted}).`)}</td></tr>
          <tr><td>Prototype Readiness</td><td>${escapeHtml(`${data.concepts.filter((entry) => entry.boardData).length} concepts have board-level prototype data.`)}</td></tr>
        </tbody>
      </table>

      <h2>Governance and Approvals</h2>
      ${
        approvedRoles.length > 0
          ? `<ul>${approvedRoles.map((entry) => `<li>${escapeHtml(entry.role)}: ${escapeHtml(entry.approver)} (${escapeHtml(formatDate(entry.approvedAt || entry.updatedAt))})</li>`).join("")}</ul>`
          : `<p>${escapeHtml("No approvals signed yet.")}</p>`
      }
    </section>
  </body>
</html>`;
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.campaign.name)} - Client Campaign Report</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; margin: 0; color: #0f172a; background: #f8fafc; }
      .page { margin: 18px auto; max-width: 980px; background: #fff; padding: 20px 24px; border: 1px solid #dbe2ea; box-sizing: border-box; }
      .cover { border: 2px solid #0f4c81; background: linear-gradient(180deg, #f8fbff 0%, #ffffff 65%); }
      h1 { font-size: 24pt; margin: 0 0 8px; color: #0f4c81; }
      h2 { font-size: 15pt; margin: 0 0 10px; color: #11497a; border-bottom: 1px solid #dbe2ea; padding-bottom: 6px; }
      h3 { font-size: 12.5pt; margin: 16px 0 8px; color: #0f172a; }
      h4 { font-size: 11.5pt; margin: 12px 0 6px; color: #1e293b; }
      h5 { font-size: 10.5pt; margin: 10px 0 6px; color: #334155; text-transform: uppercase; letter-spacing: .4px; }
      p { margin: 5px 0; }
      ul, ol { margin: 6px 0 10px 18px; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; table-layout: fixed; }
      th, td { border: 1px solid #c8d3de; padding: 6px 7px; vertical-align: top; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
      th { background: #eff5fb; font-weight: 700; }
      .meta td:first-child { width: 220px; font-weight: 700; background: #f7f9fb; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
      .kpi { border: 1px solid #d4dee8; background: #fafcff; padding: 8px; }
      .kpi .label { font-size: 9pt; text-transform: uppercase; color: #475569; }
      .kpi .value { font-size: 16pt; font-weight: 700; color: #0f4c81; margin-top: 3px; }
      .section-note { padding: 8px 10px; border-left: 3px solid #0f4c81; background: #f5f9ff; margin: 8px 0 12px; }
      article { border: 1px solid #dbe2ea; padding: 10px 12px; margin: 10px 0; background: #fcfdff; }
    </style>
  </head>
  <body>
    <section class="page cover">
      <p><strong>Client Submission Report</strong></p>
      <h1>${escapeHtml(data.campaign.name)}</h1>
      <p><strong>Country:</strong> ${escapeHtml(data.campaign.country)}</p>
      <p><strong>Campaign window:</strong> ${escapeHtml(formatDate(data.campaign.startDate))} to ${escapeHtml(formatDate(data.campaign.endDate))}</p>
      <p><strong>Status:</strong> ${escapeHtml(data.campaign.status)}</p>
      <p><strong>Generated on:</strong> ${escapeHtml(generatedAt.toLocaleString())}</p>
      <p><strong>Languages:</strong> ${escapeHtml(data.campaign.languages.join(", ") || "Not provided")}</p>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Audience Segments</div><div class="value">${data.audiences.length}</div></div>
        <div class="kpi"><div class="label">4Rs Ideas</div><div class="value">${data.ideas.length}</div></div>
        <div class="kpi"><div class="label">Selected Ideas</div><div class="value">${selectedIdeas.length}</div></div>
        <div class="kpi"><div class="label">Concepts</div><div class="value">${data.concepts.length}</div></div>
      </div>
    </section>

    <section class="page">
      <h2>Executive Summary</h2>
      <p>This document consolidates strategic and creative campaign outputs prepared for client review, approval, and execution planning.</p>
      <ul>
        <li><strong>Business objective:</strong> ${escapeHtml(safeText(data.businessObjective))}</li>
        <li><strong>Communication objective:</strong> ${escapeHtml(safeText(data.communicationObjective))}</li>
        <li><strong>Core insight:</strong> ${escapeHtml(safeText(data.insight.insightText))}</li>
        <li><strong>Primary behavioral shift:</strong> ${escapeHtml(safeText(data.behavior.desiredBehavior))}</li>
        <li><strong>Concept portfolio status:</strong> ${statusCounts.draft} draft, ${statusCounts.shortlisted} shortlisted, ${statusCounts.final} final</li>
      </ul>
      <div class="section-note">
        Recommended use: share this report with leadership, delivery teams, and creative partners as the single source of campaign intent and execution detail.
      </div>
    </section>

    <section class="page">
      <h2>1. Communication Brief Output</h2>
      <h3>Background and Objectives</h3>
      <p><strong>Situation:</strong> ${escapeHtml(safeText(data.situation))}</p>
      <p><strong>Problem / Opportunity:</strong> ${escapeHtml(safeText(data.problem))}</p>
      <p><strong>Prior Learnings:</strong> ${escapeHtml(safeText(data.priorLearnings))}</p>
      <p><strong>Business Objective:</strong> ${escapeHtml(safeText(data.businessObjective))}</p>
      <p><strong>Communication Objective:</strong> ${escapeHtml(safeText(data.communicationObjective))}</p>

      <h3>Audience Segmentation and Message Map</h3>
      ${renderTable(
        ["Priority", "Audience", "Barriers", "Motivators", "Desired Action", "Key Message", "Support / RTB", "CTA"],
        data.audiences.map((audience) => [
          audience.priority,
          audience.segmentName,
          audience.barriers,
          audience.motivators,
          audience.desiredAction,
          audience.keyMessage ?? "",
          audience.supportRtb ?? "",
          audience.cta ?? "",
        ]),
      )}

      <h3>Channel Roles and Media Plan</h3>
      ${renderTable(
        ["Category", "Channel", "Role"],
        data.channelRoles.map((entry) => [entry.category, entry.channel, entry.role]),
      )}
      ${renderTable(
        ["Channel", "Targeting", "Flighting", "Budget", "KPI", "Benchmark"],
        data.mediaPlanRows.map((row) => [row.channel, row.targeting, row.flighting, row.budget, row.kpi, row.benchmark]),
      )}

      <h3>Planning and Governance Detail</h3>
      <p><strong>Content Themes & Calendar</strong></p>
      ${toHtmlListFromText(data.contentThemesAndCalendar)}
      <p><strong>Deliverables Needed</strong></p>
      ${toHtmlListFromText(data.deliverablesNeeded)}
      <p><strong>Measurement & Learning Plan</strong></p>
      ${toHtmlListFromText(data.measurementAndLearningPlan)}
      <p><strong>Governance, Risks & Approvals</strong></p>
      ${toHtmlListFromText(data.governanceRisksAndApprovals)}
      <p><strong>Timeline Details</strong></p>
      ${toHtmlListFromText(data.timelineDetails)}
      <p><strong>Appendices</strong></p>
      ${toHtmlListFromText(data.appendices)}

      <h3>QA Checklist</h3>
      <ul>
        ${data.qaChecklist.map((item) => `<li>[${item.checked ? "x" : " "}] ${escapeHtml(item.label)}</li>`).join("")}
      </ul>
    </section>

    <section class="page">
      <h2>2. Creative Brief Output</h2>
      <table class="meta">
        <tbody>
          <tr><td>Activity Name</td><td>${escapeHtml(safeText(data.creativeBrief.activityName))}</td></tr>
          <tr><td>Agency Name</td><td>${escapeHtml(safeText(data.creativeBrief.agencyName))}</td></tr>
          <tr><td>Owner</td><td>${escapeHtml(safeText(data.creativeBrief.owner))}</td></tr>
          <tr><td>Audience</td><td>${escapeHtml(safeText(data.creativeBrief.audience))}</td></tr>
          <tr><td>Purpose</td><td>${escapeHtml(safeText(data.creativeBrief.purpose))}</td></tr>
          <tr><td>Project Name</td><td>${escapeHtml(safeText(data.creativeBrief.projectName))}</td></tr>
        </tbody>
      </table>
      <p><strong>Project Overview:</strong> ${escapeHtml(safeText(data.creativeBrief.projectOverview))}</p>
      <p><strong>Background</strong></p>
      ${toHtmlListFromText(data.creativeBrief.background)}
      <p><strong>Single-Minded Objective:</strong> ${escapeHtml(safeText(data.creativeBrief.singleMindedObjective))}</p>
      <p><strong>Audience Who</strong></p>
      ${toHtmlListFromText(data.creativeBrief.audienceWho)}
      <p><strong>Audience Tension</strong></p>
      ${toHtmlListFromText(data.creativeBrief.audienceTension)}
      <p><strong>Audience Desired Change</strong></p>
      ${toHtmlListFromText(data.creativeBrief.audienceDesiredChange)}
      <p><strong>Key Proposition:</strong> ${escapeHtml(safeText(data.creativeBrief.keyProposition))}</p>
      <p><strong>Reasons to Believe</strong></p>
      ${toHtmlListFromText(data.creativeBrief.reasonsToBelieve)}
      <p><strong>Tone and Personality</strong></p>
      ${toHtmlListFromText(data.creativeBrief.toneAndPersonality)}
      <p><strong>Cultural Cues to Embrace</strong></p>
      ${toHtmlListFromText(data.creativeBrief.culturalCuesEmbrace)}
      <p><strong>Cultural Cues to Avoid</strong></p>
      ${toHtmlListFromText(data.creativeBrief.culturalCuesAvoid)}
      <p><strong>Logo Usage</strong></p>
      ${toHtmlListFromText(data.creativeBrief.logoUsage)}
      <p><strong>Colors and Typography</strong></p>
      ${toHtmlListFromText(data.creativeBrief.colorsTypography)}
      <p><strong>Legal</strong></p>
      ${toHtmlListFromText(data.creativeBrief.legal)}
      <p><strong>DO Examples</strong></p>
      ${toHtmlListFromText(data.creativeBrief.doExamples)}
      <p><strong>DON'T Examples</strong></p>
      ${toHtmlListFromText(data.creativeBrief.dontExamples)}
      <h3>Creative Deliverables Specification</h3>
      ${renderTable(
        ["Asset", "Platform", "Format", "Dimensions / Duration", "Copy Limits", "Languages", "Accessibility"],
        data.creativeBrief.deliverables.map((entry) => [
          entry.asset,
          entry.platform,
          entry.format,
          entry.dimensionsDuration,
          entry.copyLimits,
          entry.languages,
          entry.accessibility,
        ]),
      )}
    </section>

    <section class="page">
      <h2>3. 4Rs Ideation Output</h2>
      <p><strong>Insight:</strong> ${escapeHtml(safeText(data.insight.insightText))}</p>
      <p><strong>Driver:</strong> ${escapeHtml(safeText(data.driver.driverText))}</p>
      <p><strong>Why Now:</strong> ${escapeHtml(safeText(data.driver.whyNow))}</p>
      <p><strong>Tension:</strong> ${escapeHtml(safeText(data.driver.tension))}</p>
      ${renderTable(
        ["Selected", "Method", "Title", "Description", "Insight Link", "Driver Link", "Feasibility", "Originality", "Strategic Fit", "Cultural Fit"],
        data.ideas.map((idea) => [
          idea.selected ? "Yes" : "No",
          idea.method,
          idea.title,
          idea.description,
          idea.linkToInsight,
          idea.linkToDriver,
          `${idea.feasibilityScore}/5`,
          `${idea.originalityScore}/5`,
          `${idea.strategicFitScore}/5`,
          `${idea.culturalFitScore}/5`,
        ]),
      )}
    </section>

    <section class="page">
      <h2>4. Concept Development Output</h2>
      ${data.concepts
        .map(
          (concept, index) => `
            <article>
              <h3>${index + 1}. ${escapeHtml(concept.name)}</h3>
              <p><strong>Status:</strong> ${escapeHtml(concept.status)}</p>
              <p><strong>Big Idea:</strong> ${escapeHtml(safeText(concept.bigIdea))}</p>
              <p><strong>SMP:</strong> ${escapeHtml(safeText(concept.smp))}</p>
              <p><strong>Key Promise:</strong> ${escapeHtml(safeText(concept.keyPromise))}</p>
              <p><strong>Tone:</strong> ${escapeHtml(safeText(concept.tone))}</p>
              <p><strong>Tagline:</strong> ${escapeHtml(safeText(concept.tagline))}</p>
              <p><strong>Selected Idea IDs:</strong> ${escapeHtml(concept.selectedIdeaIds.join(", ") || "Not linked")}</p>
              <p><strong>Support Points</strong></p>
              ${toHtmlList(concept.supportPoints)}
              <p><strong>Channels</strong></p>
              ${toHtmlList(concept.channels)}
              <p><strong>Risks</strong></p>
              ${toHtmlList(concept.risks)}
            </article>
          `,
        )
        .join("") || `<p>No concepts available yet.</p>`}
    </section>

    <section class="page">
      <h2>5. Concept Board / Prototype Output</h2>
      ${
        data.concepts.length > 0
          ? data.concepts.map((concept) => toPrototypeSection(concept)).join("")
          : "<p>No concept board content available yet.</p>"
      }
    </section>

    <section class="page">
      <h2>6. Collaboration Log (Chat and Comments)</h2>
      <p><strong>Team Members:</strong> ${escapeHtml(data.collaboration.members.join(", ") || "Not provided")}</p>
      ${renderTable(
        ["Date", "Author", "Message", "Mentions", "Resolved"],
        sortMessages(data.collaboration.messages).map((message) => [
          formatDate(message.createdAt),
          message.author,
          message.content,
          message.mentions.join(", "),
          message.resolved ? `Yes${message.resolvedBy ? ` by ${message.resolvedBy}` : ""}` : "No",
        ]),
      )}
    </section>

    <section class="page">
      <h2>7. Approvals and Audit Trail</h2>
      ${renderTable(
        ["Role", "Approver", "Status", "Signature", "Approved At", "Note"],
        (data.approvals || []).map((entry) => [
          entry.role,
          entry.approver,
          entry.status,
          entry.signature,
          entry.approvedAt ? formatDate(entry.approvedAt) : "-",
          entry.note || "",
        ]),
      )}
      ${renderTable(
        ["Time", "Actor", "Action", "Detail"],
        (data.auditTrail || []).map((entry) => [
          formatDate(entry.createdAt),
          entry.actor,
          entry.action,
          entry.detail,
        ]),
      )}
    </section>

    <section class="page">
      <h2>8. Approval Certificate</h2>
      ${
        approvedRoles.length > 0
          ? `<p>This campaign package contains ${approvedRoles.length} approved role signature(s), meeting governance requirements for client submission.</p>
             <ul>${approvedRoles.map((entry) => `<li>${escapeHtml(entry.role)} approved by ${escapeHtml(entry.approver)}</li>`).join("")}</ul>`
          : `<p>No approved signatures are currently attached. Submission readiness is pending role-based approval.</p>`
      }
    </section>
  </body>
</html>`;
}

export function downloadClientReportDoc(
  data: CampaignData,
  options: { mode?: ClientReportMode } = {},
): void {
  const mode = options.mode || "technical";
  const html = buildClientReportHtml(data, { mode });
  const blob = new Blob([html], { type: "application/msword" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${slugify(data.campaign.name)}-${mode === "executive" ? "executive-summary" : "client-report"}.doc`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
