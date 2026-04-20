import {
  SUPER_ADMIN_EMAIL,
  approveAdminSignup,
  clearSession,
  createQuiz,
  findQuizById,
  formatDataError,
  formatRole,
  formatStatus,
  getAdmins,
  getPendingAdminRequests,
  getQuizzes,
  getSession,
  rejectAdminSignup,
  removeAdmin,
  updateQuiz,
  initializeAppData
} from "./data.js";

initializeAppData();

const page = document.body.dataset.page;
const session = await getSession();

if (!session) {
  window.location.href = "./login.html";
  throw new Error("No active session.");
}

if (page === "admin" && session.role !== "admin") {
  window.location.href = "./login.html";
}

if (page === "superadmin" && !(session.role === "superadmin" && session.email.toLowerCase() === SUPER_ADMIN_EMAIL)) {
  window.location.href = "./login.html";
}

if (page === "admin") await setupAdminPage();
if (page === "superadmin") await setupSuperAdminPage();

async function setupAdminPage() {
  document.getElementById("adminIdentity").textContent = `${session.name} - ${formatRole(session.role)}`;
  setupTabs();
  setupQuizCreation();
  await renderManageList();
  await renderHostList();
  bindLogout();
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-link");
  const sections = document.querySelectorAll(".dashboard-tab");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      sections.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tabTarget).classList.add("active");
    });
  });
}

function setupQuizCreation() {
  const questionBuilder = document.getElementById("questionBuilder");
  const addQuestionBtn = document.getElementById("addQuestionBtn");
  const quizForm = document.getElementById("quizForm");
  const message = document.getElementById("quizFormMessage");

  if (!questionBuilder.children.length) addQuestionCard();

  addQuestionBtn.addEventListener("click", () => addQuestionCard());

  quizForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("quizTitle").value.trim();
    const questionCards = [...document.querySelectorAll(".question-card")];
    const questions = [];

    for (const card of questionCards) {
      const prompt = card.querySelector(".question-prompt").value.trim();
      const imageInput = card.querySelector(".question-image-file");

      if (!prompt) {
        message.textContent = "Each question needs a prompt.";
        return;
      }

      const options = [...card.querySelectorAll(".question-option")].map((input) => input.value.trim());
      const correctAnswer = card.querySelector(".question-correct").value.trim();
      if (options.some((option) => !option) || !correctAnswer) {
        message.textContent = "Each MCQ needs all four options and a correct answer.";
        return;
      }

      const image = imageInput?.files?.[0] ? await uploadQuestionImage(imageInput.files[0]) : "";
      questions.push({ type: "mcq", prompt, timer: 20, image, options, correctAnswer });
    }

    try {
      const quiz = await createQuiz({ title, questions, createdBy: session.id });
      message.textContent = `Saved "${quiz.title}" with ${quiz.questions.length} questions.`;
      quizForm.reset();
      questionBuilder.innerHTML = "";
      addQuestionCard();
      await renderManageList();
      await renderHostList();
    } catch (error) {
      message.textContent = formatDataError(error) || "Failed to save quiz.";
    }
  });
}

function addQuestionCard() {
  const questionBuilder = document.getElementById("questionBuilder");
  const card = document.createElement("article");
  card.className = "question-card";
  card.innerHTML = `
    <div class="question-card-header">
      <h3>Question ${questionBuilder.children.length + 1}</h3>
      <button class="button danger remove-question-btn" type="button">Remove</button>
    </div>
    <label>
      <span>Question statement</span>
      <textarea class="question-prompt" rows="3" placeholder="Write your question"></textarea>
    </label>
    <div class="mcq-fields">
      <div class="option-grid">
        <label><span>Option A</span><input class="question-option" type="text" placeholder="Option A"></label>
        <label><span>Option B</span><input class="question-option" type="text" placeholder="Option B"></label>
        <label><span>Option C</span><input class="question-option" type="text" placeholder="Option C"></label>
        <label><span>Option D</span><input class="question-option" type="text" placeholder="Option D"></label>
      </div>
      <label>
        <span>Correct option</span>
        <select class="question-correct">
          <option value="">Select correct option</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </label>
      <label>
        <span>Question image</span>
        <input class="question-image-file" type="file" accept="image/*">
      </label>
      <div class="question-image-preview hidden-block">
        <img class="question-image-preview-tag" alt="Question preview">
        <button class="button ghost remove-question-image-btn" type="button">Delete image</button>
      </div>
    </div>
    <p class="question-meta">Each question is automatically worth 10 points.</p>
  `;

  questionBuilder.appendChild(card);
  syncQuestionTitles();

  card.querySelector(".remove-question-btn").addEventListener("click", () => {
    if (questionBuilder.children.length === 1) return;
    card.remove();
    syncQuestionTitles();
  });

  card.querySelector(".question-image-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    const preview = card.querySelector(".question-image-preview");
    const previewTag = card.querySelector(".question-image-preview-tag");

    if (!file) {
      preview.classList.add("hidden-block");
      previewTag.removeAttribute("src");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      previewTag.src = reader.result;
      preview.classList.remove("hidden-block");
    };
    reader.readAsDataURL(file);
  });

  card.querySelector(".remove-question-image-btn").addEventListener("click", () => {
    const imageInput = card.querySelector(".question-image-file");
    const preview = card.querySelector(".question-image-preview");
    const previewTag = card.querySelector(".question-image-preview-tag");
    imageInput.value = "";
    previewTag.removeAttribute("src");
    preview.classList.add("hidden-block");
  });
}

function syncQuestionTitles() {
  document.querySelectorAll(".question-card").forEach((card, index) => {
    card.querySelector("h3").textContent = `Question ${index + 1}`;
  });
}

async function renderManageList() {
  const target = document.getElementById("quizManageList");
  const quizzes = await getQuizzes(session.id);

  if (!quizzes.length) {
    target.innerHTML = `<article class="quiz-card"><p>No quizzes created yet. Start by creating one in the first tab.</p></article>`;
    return;
  }

  target.innerHTML = quizzes.map((quiz) => `
    <article class="quiz-card">
      <div class="meta-row">
        <h3>${quiz.title}</h3>
        <span class="badge neutral">${formatStatus(quiz.host.status)}</span>
      </div>
      <div class="meta-row">
        <span>${quiz.questions.length} questions</span>
        <span>Room: ${quiz.host.roomCode}</span>
      </div>
      <div class="card-actions">
        <button class="button secondary regenerate-code-btn" data-quiz-id="${quiz.id}" type="button">Regenerate Room Code</button>
        <button class="button ghost reset-quiz-btn" data-quiz-id="${quiz.id}" type="button">Reset Attempts</button>
      </div>
    </article>
  `).join("");

  target.querySelectorAll(".regenerate-code-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const quiz = await findQuizById(button.dataset.quizId);
      await updateQuiz(quiz.id, {
        host: {
          roomCode: String(Math.floor(100000 + Math.random() * 900000)),
          status: "draft",
          startedAt: null,
          endedAt: null,
          resultsVisible: false
        }
      });
      await renderManageList();
      await renderHostList();
    });
  });

  target.querySelectorAll(".reset-quiz-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const quiz = await findQuizById(button.dataset.quizId);
      await updateQuiz(quiz.id, {
        host: { ...quiz.host, status: "draft", resultsVisible: false, startedAt: null, endedAt: null },
        participants: [],
        attempts: []
      });
      await renderManageList();
      await renderHostList();
    });
  });
}

async function renderHostList() {
  const target = document.getElementById("hostQuizList");
  const quizzes = await getQuizzes(session.id);

  if (!quizzes.length) {
    target.innerHTML = `<article class="quiz-card"><p>Create a quiz first to start hosting.</p></article>`;
    return;
  }

  target.innerHTML = quizzes.map((quiz) => `
    <article class="quiz-card">
      <div class="meta-row">
        <h3>${quiz.title}</h3>
        <span class="badge ${quiz.host.status === "live" ? "" : "neutral"}">${formatStatus(quiz.host.status)}</span>
      </div>
      <div class="meta-row">
        <span>Room code: <strong>${quiz.host.roomCode}</strong></span>
        <span>${quiz.participants.length} joined</span>
      </div>
      <div class="meta-row">
        <span>${quiz.attempts.length} attempts submitted</span>
        <span>Results: ${quiz.host.resultsVisible ? "Visible" : "Hidden"}</span>
      </div>
      <div class="card-actions">
        <button class="button primary host-start-btn" data-quiz-id="${quiz.id}" type="button">${quiz.host.status === "live" ? "Restart Quiz" : "Start Quiz"}</button>
        <button class="button secondary host-end-btn" data-quiz-id="${quiz.id}" type="button">End Quiz</button>
        <button class="button ghost toggle-result-btn" data-quiz-id="${quiz.id}" type="button">${quiz.host.resultsVisible ? "Hide Results" : "Show Results"}</button>
      </div>
    </article>
  `).join("");

  target.querySelectorAll(".host-start-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const quiz = await findQuizById(button.dataset.quizId);
      await updateQuiz(quiz.id, {
        host: { ...quiz.host, status: "live", startedAt: new Date().toISOString(), endedAt: null, resultsVisible: false }
      });
      await renderManageList();
      await renderHostList();
    });
  });

  target.querySelectorAll(".host-end-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const quiz = await findQuizById(button.dataset.quizId);
      await updateQuiz(quiz.id, { host: { ...quiz.host, status: "ended", endedAt: new Date().toISOString() } });
      await renderManageList();
      await renderHostList();
    });
  });

  target.querySelectorAll(".toggle-result-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const quiz = await findQuizById(button.dataset.quizId);
      await updateQuiz(quiz.id, { host: { ...quiz.host, resultsVisible: !quiz.host.resultsVisible } });
      await renderManageList();
      await renderHostList();
    });
  });
}

async function setupSuperAdminPage() {
  document.getElementById("superAdminIdentity").textContent = `${session.name} - ${formatRole(session.role)}`;
  await renderPendingRequests();
  await renderAdminUserList();
  bindLogout();
}

async function renderPendingRequests() {
  const requestList = document.getElementById("adminRequestList");
  const stats = document.getElementById("requestStats");
  const pendingRequests = await getPendingAdminRequests();
  const admins = await getAdmins();

  stats.innerHTML = `
    <article class="stat-card panel"><strong>${pendingRequests.length}</strong><span>Pending requests</span></article>
    <article class="stat-card panel"><strong>${admins.length}</strong><span>Active admins</span></article>
    <article class="stat-card panel"><strong>${pendingRequests.length + admins.length}</strong><span>Total admin records</span></article>
  `;

  if (!pendingRequests.length) {
    requestList.innerHTML = `<article class="quiz-card"><p>No pending admin requests right now.</p></article>`;
    return;
  }

  requestList.innerHTML = pendingRequests.map((request) => `
    <article class="request-card">
      <div class="meta-row">
        <h3>${request.full_name}</h3>
        <span class="badge warning">${formatStatus(request.status)}</span>
      </div>
      <p>${request.email}</p>
      <p>Requested on ${new Date(request.created_at).toLocaleString()}</p>
      <div class="card-actions">
        <button class="button primary approve-admin-btn" data-admin-email="${request.email}" type="button">Approve</button>
        <button class="button danger reject-admin-btn" data-admin-email="${request.email}" type="button">Reject</button>
      </div>
    </article>
  `).join("");

  requestList.querySelectorAll(".approve-admin-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await approveAdminSignup(button.dataset.adminEmail);
      await renderPendingRequests();
      await renderAdminUserList();
    });
  });

  requestList.querySelectorAll(".reject-admin-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await rejectAdminSignup(button.dataset.adminEmail);
      await renderPendingRequests();
      await renderAdminUserList();
    });
  });
}

async function renderAdminUserList() {
  const target = document.getElementById("adminUserList");
  const admins = await getAdmins();

  if (!admins.length) {
    target.innerHTML = `<article class="quiz-card"><p>No admins are active right now.</p></article>`;
    return;
  }

  target.innerHTML = admins.map((admin) => `
    <article class="request-card">
      <div class="meta-row">
        <h3>${admin.name}</h3>
        <span class="badge neutral">${formatRole(admin.role)}</span>
      </div>
      <p>${admin.email}</p>
      <p>Created on ${new Date(admin.createdAt).toLocaleString()}</p>
      <div class="card-actions">
        <button class="button danger remove-admin-btn" data-admin-email="${admin.email}" type="button">Remove Admin</button>
      </div>
    </article>
  `).join("");

  target.querySelectorAll(".remove-admin-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeAdmin(button.dataset.adminEmail);
      await renderPendingRequests();
      await renderAdminUserList();
    });
  });
}

function bindLogout() {
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await clearSession();
    window.location.href = "./login.html";
  });
}

async function uploadQuestionImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read question image."));
    reader.readAsDataURL(file);
  });
}
