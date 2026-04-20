import {
  addParticipantToQuiz,
  clearCurrentRoom,
  findQuizById,
  findQuizByRoomCode,
  formatStatus,
  getCurrentRoom,
  getHighestScore,
  getLeaderboard,
  getSession,
  initializeAppData,
  scoreQuiz,
  submitAttempt
} from "./data.js";

initializeAppData();

const page = document.body.dataset.page;
const session = await getSession();

if (!session) {
  window.location.href = "./login.html";
  throw new Error("No active session.");
}

if (page === "join") setupJoinPage();
if (page === "quiz") setupQuizPage();
if (page === "result") setupResultPage();

function setupJoinPage() {
  const joinForm = document.getElementById("joinForm");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const joinMessage = document.getElementById("joinMessage");
  const waitingCard = document.getElementById("waitingCard");
  const leaveRoomBtn = document.getElementById("leaveRoomBtn");
  let waitingInterval = null;

  const params = new URLSearchParams(window.location.search);
  const sharedCode = params.get("code");
  if (sharedCode && roomCodeInput) {
    roomCodeInput.value = sharedCode.trim();
  }

  restoreWaitingState();

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomCode = roomCodeInput.value.trim();

    if (!/^\d{6}$/.test(roomCode)) {
      joinMessage.textContent = "Please enter a valid 6-digit room code.";
      return;
    }

    const quiz = await findQuizByRoomCode(roomCode);

    if (!quiz) {
      joinMessage.textContent = "No room found for that code.";
      return;
    }

    await addParticipantToQuiz(quiz.id, { userId: session.id, name: session.name });
    joinMessage.textContent = `Joined room ${quiz.host.roomCode}.`;
    window.history.replaceState(null, "", `./join.html?quiz=${quiz.id}`);
    renderWaitingRoom(quiz);
  });

  leaveRoomBtn?.addEventListener("click", () => {
    clearCurrentRoom();
    waitingCard.classList.add("hidden-block");
    joinMessage.textContent = "You left the room.";
    window.history.replaceState(null, "", "./join.html");
    if (waitingInterval) clearInterval(waitingInterval);
  });

  async function restoreWaitingState() {
    const room = getCurrentRoom();
    if (!room) return;
    const quiz = await findQuizById(room.quizId);
    if (!quiz) return;
    renderWaitingRoom(quiz);
  }

  function renderWaitingRoom(quiz) {
    waitingCard.classList.remove("hidden-block");
    document.getElementById("waitingQuizTitle").textContent = quiz.title;
    document.getElementById("waitingDescription").textContent = quiz.description;
    document.getElementById("waitingParticipantName").textContent = session.name;
    document.getElementById("waitingStatusBadge").textContent = `Status: ${formatStatus(quiz.host.status)}`;

    if (waitingInterval) clearInterval(waitingInterval);
    waitingInterval = window.setInterval(async () => {
      const freshQuiz = await findQuizById(quiz.id);
      if (!freshQuiz) return;
      document.getElementById("waitingStatusBadge").textContent = `Status: ${formatStatus(freshQuiz.host.status)}`;
      if (freshQuiz.host.status === "live") {
        clearInterval(waitingInterval);
        window.location.href = `./quiz.html?quiz=${freshQuiz.id}`;
      }
    }, 1000);
  }
}

async function setupQuizPage() {
  const room = getCurrentRoom();
  const quiz = room ? await findQuizById(room.quizId) : null;
  const message = document.getElementById("quizMessage");

  if (!quiz || quiz.host.status !== "live") {
    message.textContent = "This quiz is not live right now. Join a valid active room first.";
    document.getElementById("nextQuestionBtn").disabled = true;
    return;
  }

  const roomCodeBadge = document.getElementById("quizRoomCodeBadge");
  const questionTitle = document.getElementById("quizQuestionTitle");
  const quizProgress = document.getElementById("quizProgress");
  const questionTypeBadge = document.getElementById("questionTypeBadge");
  const quizMedia = document.getElementById("quizMedia");
  const answerArea = document.getElementById("quizAnswerArea");
  const nextQuestionBtn = document.getElementById("nextQuestionBtn");

  let currentIndex = 0;
  const answers = {};
  const startedAt = Date.now();

  roomCodeBadge.textContent = `Room ${quiz.host.roomCode}`;
  renderQuestion();

  nextQuestionBtn.addEventListener("click", () => {
    captureCurrentAnswer();
    goNext();
  });

  function renderQuestion() {
    const question = quiz.questions[currentIndex];
    if (!question) return finalizeQuiz();

    quizProgress.textContent = `Question ${currentIndex + 1} of ${quiz.questions.length}`;
    questionTitle.textContent = question.prompt;
    questionTypeBadge.textContent = "MCQ";
    answerArea.innerHTML = "";
    quizMedia.innerHTML = "";
    quizMedia.classList.add("hidden-block");
    message.textContent = "";

    if (question.image) {
      quizMedia.innerHTML = `<img src="${question.image}" alt="Question visual">`;
      quizMedia.classList.remove("hidden-block");
    }

    const optionsWrapper = document.createElement("div");
    optionsWrapper.className = "answer-area";
    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.dataset.optionKey = ["A", "B", "C", "D"][index];
      button.innerHTML = `<strong>${button.dataset.optionKey}.</strong> ${option}`;
      button.addEventListener("click", () => {
        optionsWrapper.querySelectorAll(".option-button").forEach((entry) => entry.classList.remove("selected"));
        button.classList.add("selected");
      });
      optionsWrapper.appendChild(button);
    });
    answerArea.appendChild(optionsWrapper);
  }

  function captureCurrentAnswer() {
    const question = quiz.questions[currentIndex];
    if (!question) return;

    const selected = answerArea.querySelector(".option-button.selected");
    answers[question.id] = selected ? selected.dataset.optionKey : "";
  }

  function goNext() {
    currentIndex += 1;
    if (currentIndex >= quiz.questions.length) return finalizeQuiz();
    renderQuestion();
  }

  async function finalizeQuiz() {
    await submitAttempt({
      quizId: quiz.id,
      userId: session.id,
      answers,
      score: scoreQuiz(quiz, answers),
      totalQuestions: quiz.questions.length,
      totalTime: Math.round((Date.now() - startedAt) / 1000)
    });
    window.location.href = `./result.html?quiz=${quiz.id}`;
  }
}

async function setupResultPage() {
  const room = getCurrentRoom();
  const quiz = room ? await findQuizById(room.quizId) : null;
  const gateTitle = document.getElementById("resultGateTitle");
  const gateMessage = document.getElementById("resultGateMessage");
  const resultBoard = document.getElementById("resultBoard");
  const resultLockCard = document.getElementById("resultLockCard");

  if (!quiz) {
    gateTitle.textContent = "No room context found";
    gateMessage.textContent = "Join and attempt a quiz before opening the results page.";
    return;
  }

  if (!quiz.host.resultsVisible) {
    gateTitle.textContent = "Results are still locked";
    gateMessage.textContent = "The admin has not enabled result visibility yet. Refresh after the host reveals the leaderboard.";
    return;
  }

  const leaderboard = await getLeaderboard(quiz.id);
  const currentAttempt = quiz.attempts.find((attempt) => attempt.user_id === session.id);

  resultLockCard.classList.add("hidden-block");
  resultBoard.classList.remove("hidden-block");
  document.getElementById("resultQuizTitle").textContent = quiz.title;
  document.getElementById("scoreSummary").innerHTML = `
    <article class="stat-card panel"><strong>${currentAttempt ? currentAttempt.score : 0}</strong><span>Your score</span></article>
    <article class="stat-card panel"><strong>${await getHighestScore(quiz.id)}</strong><span>Highest score</span></article>
    <article class="stat-card panel"><strong>${leaderboard.length}</strong><span>Leaderboard entries</span></article>
  `;

  document.getElementById("leaderboardList").innerHTML = leaderboard.length
    ? leaderboard.map((entry) => `
      <article class="leaderboard-item top-${entry.rank}">
        <div class="leaderboard-rank">${entry.rank}</div>
        <div>
          <strong>${entry.full_name}</strong>
          <p class="muted-copy">${entry.total_time}s total time</p>
        </div>
        <strong>${entry.score}</strong>
      </article>
    `).join("")
    : `<article class="leaderboard-item"><div>No attempts available yet.</div></article>`;
}
