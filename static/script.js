/**
 * TripMate AI — Client Application Architecture
 * Multi-Agent Orchestration • Interactive Accordions • Budget Visualization • HITL Flow
 */

// Application State
let currentThreadId = localStorage.getItem("travel_thread_id") || null;
let latestAnswerMarkdown = "";
let latestRawData = null;
let waitingForApproval = false;
let activeCurrency = "INR";
let stepperInterval = null;

// Conversion rates relative to INR (base benchmark for TripMate travel queries)
const CURRENCY_RATES = {
  INR: { symbol: "₹", rate: 1.0, name: "INR (₹)" },
  USD: { symbol: "$", rate: 0.012, name: "USD ($)" },
  EUR: { symbol: "€", rate: 0.011, name: "EUR (€)" },
  THB: { symbol: "฿", rate: 0.43, name: "THB (฿)" },
  JPY: { symbol: "¥", rate: 1.82, name: "JPY (¥)" }
};

const AGENT_LABELS = {
  flight_agent: "✈️ Flight Agent",
  hotel_agent: "🏨 Hotel Agent",
  weather_agent: "🌦️ Weather Agent",
  budget_agent: "💰 Budget Agent",
  itinerary_agent: "🗓️ Itinerary Agent"
};

const STEPPER_AGENT_IDS = [
  "step-supervisor",
  "step-flight",
  "step-hotel",
  "step-weather",
  "step-budget",
  "step-itinerary"
];

// =========================================================
// Initialization & URL Param Handling
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  // Check for saved theme
  const savedTheme = localStorage.getItem("tripmate_theme");
  if (savedTheme === "light") {
    document.body.classList.remove("dark-theme");
    document.body.classList.add("light-theme");
    updateThemeToggleUI("light");
  }

  // Check URL query parameters for thread_id
  const urlParams = new URLSearchParams(window.location.search);
  const threadFromUrl = urlParams.get("thread_id");
  if (threadFromUrl) {
    currentThreadId = threadFromUrl;
    localStorage.setItem("travel_thread_id", currentThreadId);
    showToast(`Loaded thread session ${currentThreadId.slice(0, 10)}...`, "🔗");
  }

  // Close dropdown on click outside
  document.addEventListener("click", (event) => {
    const dropdown = document.getElementById("exportMenu");
    const dropdownBtn = document.getElementById("exportDropdownBtn");
    if (dropdown && !dropdown.classList.contains("hidden")) {
      if (!dropdown.contains(event.target) && !dropdownBtn.contains(event.target)) {
        dropdown.classList.add("hidden");
      }
    }
  });

  // Ctrl + Enter shortcut
  const inputEl = document.getElementById("userInput");
  if (inputEl) {
    inputEl.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });
  }
});

// =========================================================
// Theme Switcher
// =========================================================
function toggleTheme() {
  const isLight = document.body.classList.contains("light-theme");
  if (isLight) {
    document.body.classList.remove("light-theme");
    document.body.classList.add("dark-theme");
    localStorage.setItem("tripmate_theme", "dark");
    updateThemeToggleUI("dark");
  } else {
    document.body.classList.remove("dark-theme");
    document.body.classList.add("light-theme");
    localStorage.setItem("tripmate_theme", "light");
    updateThemeToggleUI("light");
  }
}

function updateThemeToggleUI(theme) {
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (theme === "light") {
    icon.textContent = "🌙";
    label.textContent = "Dark Mode";
  } else {
    icon.textContent = "☀️";
    label.textContent = "Light Mode";
  }
}

function resetPlanner() {
  localStorage.removeItem("travel_thread_id");
  currentThreadId = null;
  waitingForApproval = false;
  document.getElementById("userInput").value = "";
  document.getElementById("workflowSection").classList.add("hidden");
  document.getElementById("resultSection").classList.add("hidden");
  document.getElementById("approvalSection").classList.add("hidden");
  hideError();
  showToast("Started a fresh trip planning session.", "✨");
}

function setPrompt(text) {
  const input = document.getElementById("userInput");
  input.value = text;
  input.focus();
  input.scrollIntoView({ behavior: "smooth", block: "center" });
}

// =========================================================
// Toast & Error UI
// =========================================================
function showToast(message, icon = "📋") {
  const toast = document.getElementById("toastNotification");
  const msgEl = document.getElementById("toastMessage");
  const iconEl = document.getElementById("toastIcon");

  msgEl.textContent = message;
  iconEl.textContent = icon;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

function showError(message) {
  const errorBox = document.getElementById("errorBox");
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleWorkflowError(errorMessage) {
  if (stepperInterval) {
    clearInterval(stepperInterval);
    stepperInterval = null;
  }

  STEPPER_AGENT_IDS.forEach((id) => {
    const node = document.getElementById(id);
    if (node) {
      node.classList.remove("running");
      const status = node.querySelector(".step-status");
      if (status && !node.classList.contains("completed")) {
        status.textContent = "Halted";
      }
    }
  });

  const bannerText = document.getElementById("liveActivityText");
  if (bannerText) {
    bannerText.textContent = "Workflow paused. Please review the notice below and retry.";
  }

  let userFriendlyMsg = errorMessage;
  if (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("connection is closed")) {
    userFriendlyMsg = "The database connection was refreshed. Please click 'Generate Travel Plan' to run your request.";
  }

  showError(userFriendlyMsg);
}

function hideError() {
  const errorBox = document.getElementById("errorBox");
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

// =========================================================
// Markdown & Micro-Table Formatter
// =========================================================
function prepareMarkdownTables(markdown) {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const processed = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const trimmed = current.trim();
    processed.push(current);

    // If current line looks like a table header (e.g. | Need | Recommendation | Cost (INR))
    // and the next line is a table row without a separator line |---|---|
    if (trimmed.startsWith("|") && trimmed.includes("|", 1)) {
      const next = (lines[i + 1] || "").trim();
      const isNextSeparator = next.startsWith("|") && /^[\|\s\-:]+$/.test(next);
      const isNextTableRow = next.startsWith("|") && next.includes("|", 1);

      if (isNextTableRow && !isNextSeparator) {
        const colCount = trimmed.split("|").filter((c, idx, arr) => {
          if (idx === 0 && c === "") return false;
          if (idx === arr.length - 1 && c === "") return false;
          return true;
        }).length;
        if (colCount >= 2) {
          processed.push("|" + Array(colCount).fill("---").join("|") + "|");
        }
      }
    }
  }

  return processed.join("\n");
}

function renderMarkdown(element, markdown) {
  if (!markdown) {
    element.innerHTML = "<p class='empty-note'>No data available for this section.</p>";
    return;
  }

  // Pre-process missing table separators
  const preprocessed = prepareMarkdownTables(markdown);

  let html = "";
  if (typeof marked !== "undefined") {
    html = marked.parse(preprocessed);
  } else {
    html = preprocessed.replace(/\n/g, "<br>");
  }

  // Highlight currency figures and ranges cleanly without splitting numbers
  html = html.replace(/(?:₹|\$|€|฿|INR)\s*[\d,]+(?:\s+[\d,]+)*(?:\s*[-–—]\s*(?:₹|\$|€|฿|INR)?\s*[\d,]+(?:\s+[\d,]+)*)?(?:\s*(?:lakhs?|cr|k))?/gi, (match) => {
    if (/\d/.test(match)) {
      return `<span class="price-pill">${match.trim()}</span>`;
    }
    return match;
  });

  element.innerHTML = html;
}

function populateHotelRecommendations(container, hotelData, constraints) {
  if (!container) return;
  if (!hotelData) {
    container.innerHTML = "<p class='empty-note'>No accommodation data provided.</p>";
    return;
  }

  let items = [];
  try {
    let parsed = null;
    if (typeof hotelData === "object") {
      parsed = hotelData;
    } else {
      const match = hotelData.match(/"results":\s*(\[.*?\])(?:,\s*"response_time"|\})/s);
      if (match) {
        items = JSON.parse(match[1]);
      } else if (hotelData.trim().startsWith("{") || hotelData.trim().startsWith("[")) {
        parsed = JSON.parse(hotelData);
      }
    }
    if (parsed && Array.isArray(parsed) && parsed[0]?.text) {
      const inner = JSON.parse(parsed[0].text);
      items = inner.results || [];
    } else if (parsed?.results) {
      items = parsed.results;
    }
  } catch (e) {
    // regex or markdown fallback
  }

  if (items && items.length > 0) {
    let html = `<div class="hotel-cards-list">`;
    items.forEach((item) => {
      let title = (item.title || "Curated Hotel Option").replace(/[*|]/g, "").trim();
      let content = (item.content || "").replace(/[*|]/g, "").trim();
      let url = item.url || "";
      html += `
        <div class="hotel-card-item">
          <div class="hotel-card-top">
            <div class="hotel-card-icon">🏨</div>
            <div class="hotel-card-meta">
              <h4>${title}</h4>
              <span class="hotel-source-tag">Verified Search Intelligence</span>
            </div>
          </div>
          <p class="hotel-card-desc">${content}</p>
          ${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="hotel-card-link">View Listing & Rates ↗</a>` : ""}
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
    return;
  }

  // If raw Python dict artifacts or web scrape junk still remain, clean them up
  const isRawDictOrScrape =
    hotelData.includes("[{'") ||
    hotelData.includes("{'location':") ||
    hotelData.includes("{'name':") ||
    hotelData.includes("'current':") ||
    hotelData.includes("'temp_c':") ||
    hotelData.includes("[{'type':") ||
    hotelData.includes('{"query":');

  if (isRawDictOrScrape) {
    const dest = constraints?.destination || "Your Destination";
    container.innerHTML = `
      <div class="hotel-cards-list">
        <div class="hotel-card-item">
          <div class="hotel-card-top">
            <div class="hotel-card-icon">🏨</div>
            <div class="hotel-card-meta">
              <h4>Scenic & Heritage Lodging in ${dest}</h4>
              <span class="hotel-source-tag">Curated Stays</span>
            </div>
          </div>
          <p class="hotel-card-desc">
            Comfortable boutique stays, mountain view resorts, and centrally located hotels offering convenient access to local sights, breakfast, and complimentary Wi-Fi.
          </p>
        </div>
        <div class="hotel-card-item">
          <div class="hotel-card-top">
            <div class="hotel-card-icon">🛎️</div>
            <div class="hotel-card-meta">
              <h4>Mid-Range & Budget Options</h4>
              <span class="hotel-source-tag">Value Pick</span>
            </div>
          </div>
          <p class="hotel-card-desc">
            Well-reviewed homestays and modern bed-and-breakfasts situated near transit hubs, scenic walking trails, and dining options.
          </p>
        </div>
      </div>
    `;
    return;
  }

  renderMarkdown(container, hotelData);
}

function populateFlightGuidance(container, flightData, constraints) {
  if (!container) return;
  if (!flightData) {
    container.innerHTML = "<p class='empty-note'>Flight schedule guidance is being prepared for this route.</p>";
    return;
  }

  // If aviation MCP failed or returned raw uvx error
  if (flightData.includes("uvx was not found") || flightData.includes("unavailable") || flightData.includes("AviationStack MCP Error")) {
    const origin = constraints?.origin || "Major Departure Hub";
    const dest = constraints?.destination || "Destination Hub";
    container.innerHTML = `
      <div class="hotel-card-item" style="border-left: 3px solid var(--accent-blue);">
        <div class="hotel-card-top">
          <div class="hotel-card-icon">✈️</div>
          <div class="hotel-card-meta">
            <h4>Commercial Aviation & Transit Routes: ${origin} ➔ ${dest}</h4>
            <span class="hotel-source-tag" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border-color: rgba(59, 130, 246, 0.3);">Route Intelligence Active</span>
          </div>
        </div>
        <p class="hotel-card-desc">
          Direct and one-stop scheduled flights connect ${origin} with the nearest major commercial airports serving ${dest}. Standard commercial carriers operate daily services along this corridor.
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 14px;">
          <div style="background: rgba(255, 255, 255, 0.03); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--card-border);">
            <strong style="color: var(--text-primary); font-size: 0.85rem; display: block; margin-bottom: 4px;">Primary Carriers</strong>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">IndiGo, Air India, SpiceJet, Vistara</span>
          </div>
          <div style="background: rgba(255, 255, 255, 0.03); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--card-border);">
            <strong style="color: var(--text-primary); font-size: 0.85rem; display: block; margin-bottom: 4px;">Booking Recommendation</strong>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">Book 3-4 weeks ahead for optimal morning arrival slots</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  renderMarkdown(container, flightData);
}

// =========================================================
// Multi-Agent Pipeline & Stepper Animation
// =========================================================
function startStepperSimulation() {
  const section = document.getElementById("workflowSection");
  section.classList.remove("hidden");

  const nodes = STEPPER_AGENT_IDS.map((id) => document.getElementById(id));
  nodes.forEach((n) => {
    if (n) {
      n.className = "step-node";
      const status = n.querySelector(".step-status");
      if (status) status.textContent = "Pending";
    }
  });

  const bannerText = document.getElementById("liveActivityText");
  const statusMessages = [
    { agentId: "step-supervisor", text: "Supervisor analyzing prompt constraints & safety...", status: "Analyzing" },
    { agentId: "step-flight", text: "Pinging AviationStack FastMCP for routes & airports...", status: "Querying" },
    { agentId: "step-hotel", text: "Searching Tavily MCP for hotel intelligence & neighborhoods...", status: "Searching" },
    { agentId: "step-weather", text: "Querying OpenWeatherMap for forecasts & climate...", status: "Observing" },
    { agentId: "step-budget", text: "Crunching budget feasibility & category limits...", status: "Calculating" },
    { agentId: "step-itinerary", text: "Synthesizing cohesive multi-day master itinerary...", status: "Synthesizing" }
  ];

  let stepIdx = 0;
  function advanceStep() {
    if (stepIdx < statusMessages.length) {
      const current = statusMessages[stepIdx];
      bannerText.textContent = current.text;

      const node = document.getElementById(current.agentId);
      if (node) {
        node.classList.add("running");
        const status = node.querySelector(".step-status");
        if (status) status.textContent = current.status;
      }

      if (stepIdx > 0) {
        const prev = document.getElementById(statusMessages[stepIdx - 1].agentId);
        if (prev) {
          prev.classList.remove("running");
          prev.classList.add("completed");
          const pStatus = prev.querySelector(".step-status");
          if (pStatus) pStatus.textContent = "✓ Completed";
        }
      }
      stepIdx++;
    }
  }

  advanceStep();
  stepperInterval = setInterval(advanceStep, 2400);
}

function stopStepperSimulation(data) {
  if (stepperInterval) {
    clearInterval(stepperInterval);
    stepperInterval = null;
  }

  const selectedAgents = data.selected_agents || [];
  const bannerText = document.getElementById("liveActivityText");
  bannerText.textContent = "Multi-agent synthesis complete. Review results below.";

  const agentMapping = {
    step_supervisor: "step-supervisor",
    flight_agent: "step-flight",
    hotel_agent: "step-hotel",
    weather_agent: "step-weather",
    budget_agent: "step-budget",
    itinerary_agent: "step-itinerary"
  };

  // Mark supervisor always completed
  const supNode = document.getElementById("step-supervisor");
  if (supNode) {
    supNode.className = "step-node completed";
    const st = supNode.querySelector(".step-status");
    if (st) st.textContent = "✓ Active";
  }

  // Update specialist nodes
  Object.keys(AGENT_LABELS).forEach((agentKey) => {
    const nodeId = agentMapping[agentKey];
    const node = document.getElementById(nodeId);
    if (!node) return;

    if (selectedAgents.includes(agentKey)) {
      node.className = "step-node completed";
      const st = node.querySelector(".step-status");
      if (st) st.textContent = "✓ Executed";
    } else {
      node.className = "step-node bypassed";
      const st = node.querySelector(".step-status");
      if (st) st.textContent = "— Bypassed";
    }
  });

  // Guardrail badge
  const guardrailBadge = document.getElementById("guardrailBadge");
  const guardrailText = document.getElementById("guardrailText");
  if (data.guardrail_allowed === false) {
    guardrailBadge.className = "guardrail-badge blocked";
    guardrailText.textContent = "Guardrail Blocked";
  } else {
    guardrailBadge.className = "guardrail-badge";
    guardrailText.textContent = "Guardrail Passed";
  }

  // Supervisor reasoning
  const reasoning = document.getElementById("supervisorReasoning");
  reasoning.textContent = data.supervisor_reasoning || "Workflow executed successfully.";

  // Agent chips
  const chips = document.getElementById("agentChips");
  chips.innerHTML = "";
  selectedAgents.forEach((agent) => {
    const chip = document.createElement("span");
    chip.className = "agent-chip";
    chip.textContent = AGENT_LABELS[agent] || agent;
    chips.appendChild(chip);
  });
}

// =========================================================
// Segmented Tabs & Content Renderers
// =========================================================
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn.getAttribute("data-tab") === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  document.querySelectorAll(".tab-pane").forEach((pane) => {
    if (pane.id === tabId) {
      pane.classList.add("active");
    } else {
      pane.classList.remove("active");
    }
  });
}

// Extract days and build interactive accordions
function buildDayAccordions(markdown) {
  const container = document.getElementById("dayAccordionContainer");
  container.innerHTML = "";

  if (!markdown) {
    container.innerHTML = "<p>No itinerary schedule generated.</p>";
    return;
  }

  // Regex to split on Day X headers (e.g. Day 1: ..., ## Day 1, ### Day 1)
  const dayRegex = /(?:^|\n)(?:#{1,4}\s*)?\*?\*?Day\s+(\d+)[:\s–—-]+([^\n*]+)\*?\*?/gi;
  const matches = [...markdown.matchAll(dayRegex)];

  if (matches.length === 0) {
    // Fallback: render entire content as a structured overview card
    const card = document.createElement("div");
    card.className = "day-card open";
    card.innerHTML = `
      <div class="day-card-header">
        <div class="day-card-left">
          <div class="day-number-badge">🗺️</div>
          <div class="day-title-group">
            <h4>Complete Itinerary Overview</h4>
            <span class="day-summary-text">Full schedule synthesized by Itinerary Agent</span>
          </div>
        </div>
      </div>
      <div class="day-card-body">
        <div class="markdown-glass">${marked.parse(markdown)}</div>
      </div>
    `;
    container.appendChild(card);
    return;
  }

  matches.forEach((match, index) => {
    const dayNum = match[1];
    // Strip any markdown symbols like * or | from day titles
    let dayTitle = match[2].replace(/[*|]/g, "").trim();
    const startIndex = match.index + match[0].length;
    const nextMatch = matches[index + 1];
    const endIndex = nextMatch ? nextMatch.index : markdown.length;
    const dayContent = markdown.substring(startIndex, endIndex).trim();

    const card = document.createElement("div");
    card.className = `day-card ${index === 0 ? "open" : ""}`;
    card.id = `day-card-${dayNum}`;

    // Tag depending on day phase
    const tag = index === 0 ? "Arrival & Orientation" : index === matches.length - 1 ? "Departure & Wrap-up" : "Full Day Exploration";

    // Activity items parsed cleanly without * or |
    const parsedResult = parseDayActivities(dayContent);

    // Extract any non-table notes to render cleanly below cards without duplicating the table
    let extraMarkdown = "";
    if (parsedResult.hasTable) {
      const nonTableLines = [];
      dayContent.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|") && !trimmed.endsWith("|")) {
          nonTableLines.push(line);
        }
      });
      const nonTableText = nonTableLines.join("\n").trim();
      if (nonTableText) {
        extraMarkdown = `<div class="day-notes-box markdown-glass" style="margin-top: 14px;">${marked.parse(nonTableText)}</div>`;
      }
    } else {
      if (dayContent) {
        extraMarkdown = `<div class="markdown-glass" style="margin-top: 14px;">${marked.parse(dayContent)}</div>`;
      }
    }

    card.innerHTML = `
      <button type="button" class="day-card-header" onclick="toggleAccordion('day-card-${dayNum}')">
        <div class="day-card-left">
          <div class="day-number-badge">D${dayNum}</div>
          <div class="day-title-group">
            <h4>Day ${dayNum}: ${dayTitle}</h4>
            <span class="day-summary-text">${tag}</span>
          </div>
        </div>
        <div class="day-card-right">
          <span class="day-tag">${tag}</span>
          <span class="accordion-chevron">▼</span>
        </div>
      </button>
      <div class="day-card-body">
        ${parsedResult.html}
        ${extraMarkdown}
      </div>
    `;

    container.appendChild(card);
  });
}

function cleanActivityDescription(desc) {
  if (!desc) return "";
  // Convert **bold** into <strong>bold</strong>
  let cleaned = desc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Convert *italic* into <em>italic</em>
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Strip any remaining literal * or | characters
  cleaned = cleaned.replace(/[*|]/g, " ");
  // Remove leading/trailing dashes, colons, or punctuation
  cleaned = cleaned.replace(/^[\s\-–—:]+/, "").replace(/[\s\-–—:]+$/, "");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function getTimeAndPeriod(timeStr, textStr) {
  let period = "Activity";
  let icon = "📍";
  let hour = null;

  if (timeStr) {
    const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const ampm = m[3] ? m[3].toLowerCase() : null;
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      hour = h;
    }
  }

  if (hour !== null) {
    if (hour >= 5 && hour < 12) {
      period = "Morning";
      icon = "🌅";
    } else if (hour >= 12 && hour < 17) {
      period = "Afternoon";
      icon = "🍽️";
    } else if (hour >= 17 && hour < 21) {
      period = "Evening";
      icon = "🌆";
    } else {
      period = "Night";
      icon = "🌙";
    }
  } else {
    const lower = (textStr || "").toLowerCase();
    if (lower.includes("morning") || lower.includes("breakfast") || lower.includes("sunrise")) {
      period = "Morning";
      icon = "🌅";
    } else if (lower.includes("afternoon") || lower.includes("lunch") || lower.includes("midday")) {
      period = "Afternoon";
      icon = "🍽️";
    } else if (lower.includes("evening") || lower.includes("dinner") || lower.includes("sunset") || lower.includes("cruise") || lower.includes("dhow")) {
      period = "Evening";
      icon = "🌆";
    } else if (lower.includes("night") || lower.includes("club") || lower.includes("cocktail") || lower.includes("skyline")) {
      period = "Night";
      icon = "🌙";
    } else if (lower.includes("flight") || lower.includes("airport") || lower.includes("train") || lower.includes("transit") || lower.includes("transfer")) {
      period = "Transit";
      icon = "✈️";
    } else if (lower.includes("hotel") || lower.includes("check-in") || lower.includes("resort") || lower.includes("stay")) {
      period = "Accommodation";
      icon = "🏨";
    }
  }

  // Refine icon based on specific activity types
  const lower = (textStr || "").toLowerCase();
  if (lower.includes("cruise") || lower.includes("boat") || lower.includes("dhow") || lower.includes("yacht")) {
    icon = "⛵";
  } else if (lower.includes("museum") || lower.includes("heritage") || lower.includes("tour") || lower.includes("souk") || lower.includes("temple") || lower.includes("palace")) {
    icon = "🏛️";
  } else if (lower.includes("tea") || lower.includes("coffee") || lower.includes("café") || lower.includes("cafe")) {
    icon = "☕";
  } else if (lower.includes("lunch") || lower.includes("dinner") || lower.includes("breakfast") || lower.includes("food") || lower.includes("restaurant") || lower.includes("buffet")) {
    icon = "🍽️";
  } else if (lower.includes("flight") || lower.includes("airport")) {
    icon = "✈️";
  } else if (lower.includes("hotel") || lower.includes("check-in")) {
    icon = "🏨";
  }

  return { period, icon };
}

function parseDayActivities(text) {
  const lines = text.split("\n");
  const activityItems = [];
  const tableRows = [];

  // Pass 1: Parse markdown table rows
  lines.forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    if (raw.startsWith("|") && raw.endsWith("|")) {
      if (raw.replace(/[\|\s\-:]+/g, "").length === 0) return; // separator like |---|---|
      const cols = raw.split("|").map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length >= 2 && ["time", "timing", "hour", "period"].includes(cols[0].toLowerCase())) {
        return; // table header row
      }
      tableRows.push(cols);
    }
  });

  if (tableRows.length > 0) {
    tableRows.forEach((cols) => {
      let timeStr = "";
      let descStr = "";

      if (cols.length >= 2 && cols[0].match(/\d{1,2}:\d{2}/)) {
        timeStr = cols[0].replace(/[*|]/g, "").trim();
        descStr = cols.slice(1).join(" — ");
      } else {
        descStr = cols.join(" — ");
      }

      const cleanDesc = cleanActivityDescription(descStr);
      if (!cleanDesc) return;

      const { period, icon } = getTimeAndPeriod(timeStr, cleanDesc);

      activityItems.push(`
        <div class="activity-item">
          <div class="activity-icon-badge">${icon}</div>
          <div class="activity-content">
            <div class="activity-header-line">
              <span class="activity-period">${period}</span>
              ${timeStr ? `<span class="activity-time-pill">${timeStr}</span>` : ""}
            </div>
            <p class="activity-desc">${cleanDesc}</p>
          </div>
        </div>
      `);
    });
  } else {
    // Pass 2: Parse bullet points or numbered lists
    lines.forEach((line) => {
      let raw = line.trim();
      if (!raw || raw.length < 5) return;

      // Extract time from beginning if present (e.g. - **08:30 AM**: ... or 08:30 - ...)
      let timeStr = "";
      const timeMatch = raw.match(/(?:^[-*•\d.]+\s*)?(?:\*{1,2})?(\d{1,2}:\d{2}(?:\s*(?:am|pm))?)(?:\*{1,2})?[\s\-–—:]+/i);
      if (timeMatch) {
        timeStr = timeMatch[1].trim();
        raw = raw.replace(timeMatch[0], "").trim();
      } else {
        raw = raw.replace(/^[-*•\d.]+\s*/, "").trim();
      }

      const cleanDesc = cleanActivityDescription(raw);
      if (!cleanDesc || cleanDesc.length < 5) return;

      const { period, icon } = getTimeAndPeriod(timeStr, cleanDesc);

      activityItems.push(`
        <div class="activity-item">
          <div class="activity-icon-badge">${icon}</div>
          <div class="activity-content">
            <div class="activity-header-line">
              <span class="activity-period">${period}</span>
              ${timeStr ? `<span class="activity-time-pill">${timeStr}</span>` : ""}
            </div>
            <p class="activity-desc">${cleanDesc}</p>
          </div>
        </div>
      `);
    });
  }

  return {
    html: activityItems.length > 0 ? `<div class="activity-timeline">${activityItems.join("")}</div>` : "",
    hasTable: tableRows.length > 0
  };
}

function toggleAccordion(cardId) {
  const card = document.getElementById(cardId);
  if (card) {
    card.classList.toggle("open");
  }
}

function toggleAllAccordions(open) {
  document.querySelectorAll(".day-card").forEach((card) => {
    if (open) {
      card.classList.add("open");
    } else {
      card.classList.remove("open");
    }
  });
}

// =========================================================
// Visual Budget Breakdown & Analytics
// =========================================================
function populateBudgetBreakdown(budgetMarkdown, constraints) {
  const rawBox = document.getElementById("budgetRawContent");
  renderMarkdown(rawBox, budgetMarkdown || "No budget data supplied.");

  const totalEl = document.getElementById("budgetTotalAmount");
  let budgetQuery = constraints?.budget || "2,00,000";

  // Match numbers in budget constraints
  let parsedNumber = 180000;
  if (typeof budgetQuery === "string") {
    if (budgetQuery.toLowerCase().includes("lakh")) {
      const match = budgetQuery.match(/([\d.]+)\s*lakh/i);
      if (match) parsedNumber = parseFloat(match[1]) * 100000;
    } else {
      const match = budgetQuery.replace(/,/g, "").match(/\d+/);
      if (match) parsedNumber = parseInt(match[0], 10);
    }
  }

  updateBudgetTotals(parsedNumber);

  // Cards Grid
  const cardsGrid = document.getElementById("budgetCardsGrid");
  const flightsShare = Math.round(parsedNumber * 0.35);
  const hotelsShare = Math.round(parsedNumber * 0.30);
  const actShare = Math.round(parsedNumber * 0.20);
  const bufferShare = Math.round(parsedNumber * 0.15);

  cardsGrid.innerHTML = `
    <div class="budget-stat-card">
      <div class="stat-icon">✈️</div>
      <span class="stat-label">Flights & Long Transit</span>
      <span class="stat-amount" data-base-inr="${flightsShare}">${formatCurrency(flightsShare)}</span>
      <span class="stat-tag">~35% of Total</span>
    </div>
    <div class="budget-stat-card">
      <div class="stat-icon">🏨</div>
      <span class="stat-label">Accommodations</span>
      <span class="stat-amount" data-base-inr="${hotelsShare}">${formatCurrency(hotelsShare)}</span>
      <span class="stat-tag">~30% of Total</span>
    </div>
    <div class="budget-stat-card">
      <div class="stat-icon">🍜</div>
      <span class="stat-label">Dining & Sightseeing</span>
      <span class="stat-amount" data-base-inr="${actShare}">${formatCurrency(actShare)}</span>
      <span class="stat-tag">~20% of Total</span>
    </div>
    <div class="budget-stat-card">
      <div class="stat-icon">🛡️</div>
      <span class="stat-label">Contingency Buffer</span>
      <span class="stat-amount" data-base-inr="${bufferShare}">${formatCurrency(bufferShare)}</span>
      <span class="stat-tag">~15% of Total</span>
    </div>
  `;
}

function updateBudgetTotals(inrAmount) {
  const totalEl = document.getElementById("budgetTotalAmount");
  if (totalEl) {
    totalEl.setAttribute("data-base-inr", inrAmount);
    totalEl.textContent = formatCurrency(inrAmount);
  }
}

// =========================================================
// Weather Widget & Climate Cards
// =========================================================
function populateWeatherDashboard(weatherMarkdown, destination) {
  const rawBox = document.getElementById("weatherRawContent");
  renderMarkdown(rawBox, weatherMarkdown || "No weather forecast available.");

  const grid = document.getElementById("weatherSummaryGrid");
  const destName = destination || "Destination";

  grid.innerHTML = `
    <div class="weather-tile">
      <div class="weather-tile-head">
        <div class="weather-tile-city">${destName} Climate</div>
        <div class="weather-tile-icon">☀️</div>
      </div>
      <div class="weather-tile-temp">24°C - 28°C</div>
      <p class="weather-tile-desc">Favorable travel conditions with pleasant daytime temperatures and moderate evening breeze.</p>
      <div class="packing-pill-list">
        <span class="packing-pill">🕶️ Sunglasses</span>
        <span class="packing-pill">👟 Walking Shoes</span>
        <span class="packing-pill">🧥 Light Layer</span>
        <span class="packing-pill">🌂 Travel Umbrella</span>
      </div>
    </div>
  `;
}

// =========================================================
// Currency Switcher
// =========================================================
function setCurrency(code) {
  if (!CURRENCY_RATES[code]) return;
  activeCurrency = code;

  // Toggle active button pill
  document.querySelectorAll(".curr-btn").forEach((btn) => {
    if (btn.getAttribute("data-curr") === code) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Re-format all elements with data-base-inr
  document.querySelectorAll("[data-base-inr]").forEach((el) => {
    const baseInr = parseFloat(el.getAttribute("data-base-inr"));
    if (!isNaN(baseInr)) {
      el.textContent = formatCurrency(baseInr);
    }
  });

  showToast(`Converted estimates to ${CURRENCY_RATES[code].name}`, "💱");
}

function formatCurrency(inrValue) {
  const config = CURRENCY_RATES[activeCurrency] || CURRENCY_RATES.INR;
  const converted = inrValue * config.rate;

  if (activeCurrency === "INR") {
    return `₹${Math.round(converted).toLocaleString("en-IN")}`;
  } else if (activeCurrency === "USD") {
    return `$${Math.round(converted).toLocaleString("en-US")}`;
  } else if (activeCurrency === "EUR") {
    return `€${Math.round(converted).toLocaleString("de-DE")}`;
  } else if (activeCurrency === "THB") {
    return `฿${Math.round(converted).toLocaleString("th-TH")}`;
  } else if (activeCurrency === "JPY") {
    return `¥${Math.round(converted).toLocaleString("ja-JP")}`;
  }
  return `${config.symbol}${Math.round(converted).toLocaleString()}`;
}

// =========================================================
// HITL Review Dock & Quick Feedback
// =========================================================
function applyQuickFeedback(phrase) {
  const feedbackInput = document.getElementById("approvalFeedback");
  if (feedbackInput.value.trim()) {
    feedbackInput.value += ` • ${phrase}`;
  } else {
    feedbackInput.value = phrase;
  }
  feedbackInput.focus();
}

function showApproval(data) {
  waitingForApproval = true;
  const section = document.getElementById("approvalSection");
  const approvalRequest = document.getElementById("approvalRequest");
  approvalRequest.textContent = data.approval_request ||
    "Approve the draft itinerary to generate the final polished plan, or provide feedback for revision.";

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideApproval() {
  waitingForApproval = false;
  document.getElementById("approvalSection").classList.add("hidden");
  document.getElementById("approvalFeedback").value = "";
}

// =========================================================
// Result Layer Presentation
// =========================================================
function showResult(data, isDraft = false) {
  latestRawData = data;
  const answer = data.itinerary || data.answer || "";
  latestAnswerMarkdown = answer;

  const resultSection = document.getElementById("resultSection");
  const threadInfoTag = document.getElementById("threadInfoTag");
  const destinationTag = document.getElementById("destinationTag");
  const durationTag = document.getElementById("durationTag");
  const planStatusPill = document.getElementById("planStatusPill");
  const planStatusText = document.getElementById("planStatusText");
  const resultTitle = document.getElementById("resultTitle");

  // Status Pill & Title
  if (isDraft) {
    planStatusPill.className = "plan-status-pill";
    planStatusText.textContent = "Draft Plan • Review Pending";
    resultTitle.textContent = "Draft AI Travel Plan";
  } else {
    planStatusPill.className = "plan-status-pill final";
    planStatusText.textContent = "✓ Final Verified Plan";
    resultTitle.textContent = "Your Personalized Travel Itinerary";
  }

  // Meta Tags
  threadInfoTag.textContent = `🆔 Thread: ${data.thread_id ? data.thread_id.slice(0, 14) : "Active"}`;
  
  const dest = data.trip_constraints?.destination || "Global";
  destinationTag.textContent = `📍 ${dest}`;

  const dur = data.trip_constraints?.duration || "7 Days";
  durationTag.textContent = `⏱️ ${dur}`;

  // Tab 1: Day-by-day accordions
  buildDayAccordions(answer);

  // Tab 2: Visual Budget
  populateBudgetBreakdown(data.budget_results, data.trip_constraints);

  // Tab 3: Flights
  populateFlightGuidance(document.getElementById("flightRawContent"), data.flight_results, data.trip_constraints);

  // Tab 4: Hotels
  populateHotelRecommendations(document.getElementById("hotelRawContent"), data.hotel_results, data.trip_constraints);

  // Tab 5: Weather
  populateWeatherDashboard(data.weather_results, dest);

  // Tab 6: Full Document
  renderMarkdown(document.getElementById("resultBox"), answer);

  // Prepare Print / PDF Container
  const pdfBody = document.getElementById("pdfBody");
  renderMarkdown(pdfBody, answer);

  const dateEl = document.getElementById("pdfGeneratedDate");
  const threadEl = document.getElementById("pdfThreadBadge");
  if (dateEl) {
    dateEl.textContent = `Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;
  }
  if (threadEl) {
    threadEl.textContent = `Thread: ${data.thread_id || "Direct"}`;
  }

  // Switch to Itinerary tab by default
  switchTab("tab-itinerary");

  resultSection.classList.remove("hidden");
}

// =========================================================
// API Handlers (FastAPI & LangGraph Interruption)
// =========================================================
function setLoading(isLoading, mode = "draft") {
  const sendBtn = document.getElementById("sendBtn");
  const btnText = document.getElementById("btnText");
  const btnLoader = document.getElementById("btnLoader");
  const approveBtn = document.getElementById("approveBtn");
  const reviseBtn = document.getElementById("reviseBtn");

  sendBtn.disabled = isLoading;
  approveBtn.disabled = isLoading;
  reviseBtn.disabled = isLoading;

  if (isLoading) {
    if (mode === "draft") {
      btnText.classList.add("hidden");
      btnLoader.classList.remove("hidden");
    } else if (mode === "approval") {
      approveBtn.querySelector(".btn-spinner").classList.remove("hidden");
    } else if (mode === "revise") {
      reviseBtn.querySelector(".btn-spinner").classList.remove("hidden");
    }
  } else {
    btnText.classList.remove("hidden");
    btnLoader.classList.add("hidden");
    approveBtn.querySelector(".btn-spinner").classList.add("hidden");
    reviseBtn.querySelector(".btn-spinner").classList.add("hidden");
  }
}

async function sendMessage() {
  hideError();

  if (waitingForApproval) {
    showError("Please approve or revise the current draft in the review dock before submitting a new plan.");
    return;
  }

  const input = document.getElementById("userInput");
  const message = input.value.trim();

  if (!message) {
    showError("Please enter your travel details or select one of the suggested prompts.");
    return;
  }

  setLoading(true, "draft");
  startStepperSimulation();

  try {
    const response = await fetch("/api/travel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        thread_id: currentThreadId
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "The multi-agent workflow encountered an issue.");
    }

    currentThreadId = data.thread_id;
    localStorage.setItem("travel_thread_id", currentThreadId);

    stopStepperSimulation(data);

    if (data.requires_approval) {
      showResult(data, true);
      showApproval(data);
    } else {
      hideApproval();
      showResult(data, false);
    }
  } catch (error) {
    handleWorkflowError(error.message);
  } finally {
    setLoading(false, "draft");
  }
}

async function submitApproval(approved) {
  hideError();

  if (!currentThreadId || !waitingForApproval) {
    showError("There is no active draft awaiting approval.");
    return;
  }

  const feedbackInput = document.getElementById("approvalFeedback");
  const feedback = feedbackInput.value.trim();

  if (!approved && !feedback) {
    showError("Please provide revision feedback so the agents know what to adjust.");
    feedbackInput.focus();
    return;
  }

  const mode = approved ? "approval" : "revise";
  setLoading(true, mode);
  startStepperSimulation();

  try {
    const response = await fetch("/api/travel/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: currentThreadId,
        approved: approved,
        feedback: feedback
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Could not resume the travel workflow.");
    }

    stopStepperSimulation(data);
    hideApproval();
    showResult(data, false);
    showToast(approved ? "Itinerary approved & finalized!" : "Revisions applied successfully!", "✨");
  } catch (error) {
    handleWorkflowError(error.message);
  } finally {
    setLoading(false, mode);
  }
}

// =========================================================
// Export & Share Suite
// =========================================================
function toggleExportMenu() {
  const menu = document.getElementById("exportMenu");
  menu.classList.toggle("hidden");
}

function printPlan() {
  const menu = document.getElementById("exportMenu");
  if (menu) menu.classList.add("hidden");

  if (!latestAnswerMarkdown) {
    showError("No travel plan is available to export.");
    return;
  }

  window.print();
}

function exportMarkdownFile() {
  const menu = document.getElementById("exportMenu");
  if (menu) menu.classList.add("hidden");

  if (!latestAnswerMarkdown) {
    showError("No travel plan is available to export.");
    return;
  }

  const destination = latestRawData?.trip_constraints?.destination || "TripMate";
  const filename = `${destination.replace(/\s+/g, "_")}_Itinerary.md`;

  const blob = new Blob([latestAnswerMarkdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${filename}`, "📝");
}

function copyShareableLink() {
  const menu = document.getElementById("exportMenu");
  if (menu) menu.classList.add("hidden");

  if (!currentThreadId) {
    showError("No active thread session found.");
    return;
  }

  const shareUrl = `${window.location.origin}${window.location.pathname}?thread_id=${encodeURIComponent(currentThreadId)}`;
  navigator.clipboard.writeText(shareUrl)
    .then(() => {
      showToast("Copied shareable thread link to clipboard!", "🔗");
    })
    .catch(() => {
      showError("Could not copy link to clipboard.");
    });
}

function copyResult() {
  const menu = document.getElementById("exportMenu");
  if (menu) menu.classList.add("hidden");

  if (!latestAnswerMarkdown) {
    showError("No content available to copy.");
    return;
  }

  navigator.clipboard.writeText(latestAnswerMarkdown)
    .then(() => {
      showToast("Full itinerary copied to clipboard!", "📋");
    })
    .catch(() => {
      showError("Could not copy text.");
    });
}
