export const SUPER_ADMIN_EMAIL = "priyanshubrar55@gmail.com";

const SUPER_ADMIN_PASSWORD = "admin@780";
const STORAGE_PREFIX = "menti_mentor_local_v1";
const USERS_KEY = `${STORAGE_PREFIX}_users`;
const REQUESTS_KEY = `${STORAGE_PREFIX}_admin_requests`;
const QUIZZES_KEY = `${STORAGE_PREFIX}_quizzes`;
const SESSION_KEY = `${STORAGE_PREFIX}_session`;
const ROOM_KEY = "menti_mentor_room_v1";

function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch (error) {
    console.error(`Failed to parse localStorage key ${key}:`, error);
    return clone(fallback);
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readUsers() {
  return readJson(USERS_KEY, []);
}

function writeUsers(users) {
  writeJson(USERS_KEY, users);
}

function readAdminRequests() {
  return readJson(REQUESTS_KEY, []);
}

function writeAdminRequests(requests) {
  writeJson(REQUESTS_KEY, requests);
}

function readQuizzes() {
  return readJson(QUIZZES_KEY, []);
}

function writeQuizzes(quizzes) {
  writeJson(QUIZZES_KEY, quizzes.map(sanitizeQuiz));
}

function getUserSafeProfile(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt
  };
}

function findUserByEmailSync(email) {
  const normalizedEmail = normalizeEmail(email);
  return readUsers().find((user) => normalizeEmail(user.email) === normalizedEmail) || null;
}

function getLatestAdminRequestByEmailSync(email) {
  const normalizedEmail = normalizeEmail(email);
  return readAdminRequests()
    .filter((request) => normalizeEmail(request.email) === normalizedEmail)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

function generateRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateUniqueRoomCode(maxAttempts = 20) {
  const quizzes = readQuizzes();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateRoomCode();
    if (!quizzes.some((quiz) => quiz.host?.roomCode === code)) return code;
  }

  throw new Error("Unable to generate a unique room code. Please try again.");
}

function sanitizeQuestion(question, index = 0) {
  const options = Array.isArray(question.options)
    ? question.options.map((option) => String(option || "").trim())
    : [
        question.option_a,
        question.option_b,
        question.option_c,
        question.option_d
      ].filter(Boolean).map((option) => String(option || "").trim());

  return {
    id: question.id || createId(`question-${index + 1}`),
    type: "mcq",
    prompt: String(question.prompt || question.question || "").trim(),
    options,
    correctAnswer: String(question.correctAnswer || question.correct_option || "").trim().toUpperCase(),
    image: question.image || "",
    timer: Number(question.timer) || 20,
    points: Number(question.points) || 10
  };
}

function sanitizeQuiz(quiz) {
  return {
    id: quiz.id,
    title: String(quiz.title || "").trim(),
    description: String(quiz.description || "").trim(),
    createdBy: quiz.createdBy || quiz.creator_id || null,
    createdAt: quiz.createdAt || quiz.created_at || nowIso(),
    host: {
      roomCode: String(quiz.host?.roomCode || quiz.code || ""),
      status: quiz.host?.status || quiz.status || "draft",
      resultsVisible: Boolean(quiz.host?.resultsVisible),
      startedAt: quiz.host?.startedAt || null,
      endedAt: quiz.host?.endedAt || null
    },
    participants: Array.isArray(quiz.participants) ? quiz.participants : [],
    attempts: Array.isArray(quiz.attempts) ? quiz.attempts : [],
    questions: Array.isArray(quiz.questions) ? quiz.questions.map(sanitizeQuestion) : []
  };
}

function ensureSuperAdminProfile() {
  const users = readUsers();
  let superAdmin = users.find((user) => normalizeEmail(user.email) === SUPER_ADMIN_EMAIL);

  if (!superAdmin) {
    superAdmin = {
      id: createId("user"),
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      name: "Super Admin",
      role: "superadmin",
      createdAt: nowIso()
    };
    users.push(superAdmin);
  } else {
    superAdmin.password = SUPER_ADMIN_PASSWORD;
    superAdmin.name = superAdmin.name || "Super Admin";
    superAdmin.role = "superadmin";
  }

  writeUsers(users);
  return getUserSafeProfile(superAdmin);
}

function validatePassword(password) {
  return String(password || "").length >= 6;
}

export function initializeAppData() {
  readUsers();
  readAdminRequests();
  readQuizzes();
  ensureSuperAdminProfile();
}

export function formatDataError(error) {
  return error?.message || String(error || "Unexpected error.");
}

export async function getSession() {
  initializeAppData();
  const session = readJson(SESSION_KEY, null);
  if (!session?.id) return null;

  const user = readUsers().find((entry) => entry.id === session.id);
  return getUserSafeProfile(user);
}

export function setSession(user) {
  if (!user?.id) return;
  writeJson(SESSION_KEY, { id: user.id });
}

export async function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userRole");
  localStorage.removeItem(ROOM_KEY);
}

export async function createPendingSignup({ name, email, password, role = "user" }) {
  initializeAppData();
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = String(name || "").trim();
  const normalizedRole = role === "admin" ? "admin" : "user";

  if (!trimmedName || !normalizedEmail || !password) {
    return { error: "Name, email, and password are required." };
  }

  if (!validatePassword(password)) {
    return { error: "Password must be at least 6 characters long." };
  }

  const users = readUsers();
  let existingUser = users.find((user) => normalizeEmail(user.email) === normalizedEmail);

  if (normalizedRole === "user") {
    if (existingUser) return { error: "This email is already registered. Please log in instead." };

    const user = {
      id: createId("user"),
      email: normalizedEmail,
      password,
      name: trimmedName,
      role: "user",
      createdAt: nowIso()
    };
    users.push(user);
    writeUsers(users);
    return { user: getUserSafeProfile(user) };
  }

  if (existingUser?.role === "admin" || existingUser?.role === "superadmin") {
    return { error: "This email already has elevated access." };
  }

  if (!existingUser) {
    existingUser = {
      id: createId("user"),
      email: normalizedEmail,
      password,
      name: trimmedName,
      role: "user",
      createdAt: nowIso()
    };
    users.push(existingUser);
  } else {
    if (existingUser.password !== password) {
      return { error: "This email is already registered. Enter its correct password to request admin access." };
    }
    existingUser.name = trimmedName;
  }

  const latestRequest = getLatestAdminRequestByEmailSync(normalizedEmail);
  if (latestRequest?.status === "pending") {
    writeUsers(users);
    return { error: "An admin request for this email is already pending review." };
  }

  const requests = readAdminRequests();
  requests.push({
    id: createId("request"),
    full_name: trimmedName,
    email: normalizedEmail,
    user_id: existingUser.id,
    role: "admin",
    status: "pending",
    created_at: nowIso(),
    reviewed_by: null,
    reviewed_at: null
  });

  writeUsers(users);
  writeAdminRequests(requests);
  return { pendingSignup: { email: normalizedEmail, role: "admin", status: "pending" } };
}

export async function getPendingSignupByEmail(email) {
  initializeAppData();
  return getLatestAdminRequestByEmailSync(email);
}

export async function authenticateUser(email, password) {
  initializeAppData();
  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
    const superAdmin = ensureSuperAdminProfile();
    setSession(superAdmin);
    return { user: superAdmin, error: null };
  }

  const user = findUserByEmailSync(normalizedEmail);
  if (!user || user.password !== password) {
    return { user: null, error: "Invalid email or password." };
  }

  const profile = getUserSafeProfile(user);
  setSession(profile);
  return { user: profile, error: null };
}

export async function getPendingAdminRequests() {
  initializeAppData();
  return readAdminRequests()
    .filter((request) => request.status === "pending")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function approveAdminSignup(email) {
  initializeAppData();
  const session = await getSession();
  const normalizedEmail = normalizeEmail(email);
  const users = readUsers();
  const user = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail);

  if (!user) throw new Error("User not found for this admin request.");

  user.role = "admin";
  writeUsers(users);

  const requests = readAdminRequests().map((request) => {
    if (normalizeEmail(request.email) !== normalizedEmail || request.status !== "pending") return request;
    return {
      ...request,
      status: "approved",
      reviewed_by: session?.id || null,
      reviewed_at: nowIso()
    };
  });
  writeAdminRequests(requests);
}

export async function rejectAdminSignup(email) {
  initializeAppData();
  const session = await getSession();
  const normalizedEmail = normalizeEmail(email);
  const requests = readAdminRequests().map((request) => {
    if (normalizeEmail(request.email) !== normalizedEmail || request.status !== "pending") return request;
    return {
      ...request,
      status: "rejected",
      reviewed_by: session?.id || null,
      reviewed_at: nowIso()
    };
  });
  writeAdminRequests(requests);
}

export async function getAdmins() {
  initializeAppData();
  return readUsers()
    .filter((user) => user.role === "admin")
    .map(getUserSafeProfile)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function removeAdmin(email) {
  initializeAppData();
  const normalizedEmail = normalizeEmail(email);
  const users = readUsers();
  const user = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail);

  if (user?.role === "admin") {
    user.role = "user";
    writeUsers(users);
  }

  const requests = readAdminRequests().map((request) => {
    if (normalizeEmail(request.email) !== normalizedEmail) return request;
    return { ...request, status: "removed", reviewed_at: nowIso() };
  });
  writeAdminRequests(requests);
}

export async function getQuizzes(createdBy = null) {
  initializeAppData();
  return readQuizzes()
    .map(sanitizeQuiz)
    .filter((quiz) => !createdBy || quiz.createdBy === createdBy)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createQuiz({ title, questions, createdBy }) {
  initializeAppData();
  const normalizedTitle = String(title || "").trim();

  if (!normalizedTitle) throw new Error("Quiz title is required.");
  if (!Array.isArray(questions) || !questions.length) throw new Error("Add at least one question before saving the quiz.");

  const quiz = sanitizeQuiz({
    id: createId("quiz"),
    title: normalizedTitle,
    description: "",
    createdBy,
    createdAt: nowIso(),
    host: {
      roomCode: generateUniqueRoomCode(),
      status: "draft",
      resultsVisible: false,
      startedAt: null,
      endedAt: null
    },
    participants: [],
    attempts: [],
    questions: questions.map(sanitizeQuestion)
  });

  const quizzes = readQuizzes();
  quizzes.push(quiz);
  writeQuizzes(quizzes);
  return clone(quiz);
}

export async function updateQuiz(quizId, updates) {
  initializeAppData();
  const quizzes = readQuizzes();
  const index = quizzes.findIndex((quiz) => quiz.id === quizId);

  if (index < 0) throw new Error("Quiz not found.");

  const current = sanitizeQuiz(quizzes[index]);
  const next = sanitizeQuiz({
    ...current,
    ...updates,
    host: updates.host ? { ...current.host, ...updates.host } : current.host,
    questions: updates.questions ? updates.questions.map(sanitizeQuestion) : current.questions,
    participants: updates.participants ? clone(updates.participants) : current.participants,
    attempts: updates.attempts ? clone(updates.attempts) : current.attempts
  });

  quizzes[index] = next;
  writeQuizzes(quizzes);
  return clone(next);
}

export async function findQuizByRoomCode(roomCode) {
  initializeAppData();
  const normalizedCode = String(roomCode || "").trim();
  const quiz = readQuizzes().map(sanitizeQuiz).find((entry) => entry.host.roomCode === normalizedCode);
  return quiz ? clone(quiz) : null;
}

export async function findQuizById(quizId) {
  initializeAppData();
  const quiz = readQuizzes().map(sanitizeQuiz).find((entry) => entry.id === quizId);
  return quiz ? clone(quiz) : null;
}

export async function addParticipantToQuiz(quizId, participant) {
  const quiz = await findQuizById(quizId);
  if (!quiz) throw new Error("Quiz not found.");

  if (!quiz.participants.some((entry) => entry.user_id === participant.userId)) {
    quiz.participants.push({
      id: createId("participant"),
      user_id: participant.userId,
      name: participant.name || "Participant",
      joined_at: nowIso()
    });
    await updateQuiz(quizId, { participants: quiz.participants });
  }

  setCurrentRoom({ quizId });
  return clone(quiz);
}

export function scoreQuiz(quiz, answerMap) {
  let score = 0;
  quiz.questions.forEach((question) => {
    const submitted = answerMap[question.id];
    if (!submitted) return;
    if (String(submitted).trim().toUpperCase() === String(question.correctAnswer).trim().toUpperCase()) {
      score += Number(question.points) || 10;
    }
  });
  return score;
}

export async function submitAttempt({ quizId, userId, answers, score, totalQuestions, totalTime }) {
  const quiz = await findQuizById(quizId);
  if (!quiz) return null;

  const attempt = {
    id: createId("attempt"),
    quiz_id: quizId,
    user_id: userId,
    answers: clone(answers || {}),
    score: Number(score) || 0,
    total_questions: Number(totalQuestions) || quiz.questions.length,
    total_time: Number(totalTime) || 0,
    submitted_at: nowIso()
  };

  const existingIndex = quiz.attempts.findIndex((entry) => entry.user_id === userId);
  if (existingIndex >= 0) {
    quiz.attempts[existingIndex] = attempt;
  } else {
    quiz.attempts.push(attempt);
  }

  await updateQuiz(quizId, { attempts: quiz.attempts });
  setCurrentRoom({ quizId });
  return true;
}

export async function getLeaderboard(quizId) {
  initializeAppData();
  const quiz = await findQuizById(quizId);
  if (!quiz) return [];

  const users = readUsers();
  return quiz.attempts
    .map((attempt) => {
      const user = users.find((entry) => entry.id === attempt.user_id);
      return {
        quiz_id: quizId,
        user_id: attempt.user_id,
        full_name: user?.name || quiz.participants.find((entry) => entry.user_id === attempt.user_id)?.name || "Participant",
        score: attempt.score,
        total_questions: attempt.total_questions,
        total_time: attempt.total_time,
        submitted_at: attempt.submitted_at
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.total_time !== b.total_time) return a.total_time - b.total_time;
      return new Date(a.submitted_at) - new Date(b.submitted_at);
    })
    .slice(0, 10)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function getHighestScore(quizId) {
  const leaderboard = await getLeaderboard(quizId);
  return leaderboard.length ? leaderboard[0].score : 0;
}

export function getCurrentRoom() {
  const stored = readJson(ROOM_KEY, null);
  if (stored?.quizId) return stored;

  const params = new URLSearchParams(window.location.search);
  const quizId = params.get("quiz");
  return quizId ? { quizId } : null;
}

export function setCurrentRoom(room) {
  if (!room?.quizId) return;
  writeJson(ROOM_KEY, { quizId: room.quizId });
}

export function clearCurrentRoom() {
  localStorage.removeItem(ROOM_KEY);
}

export function formatRole(role) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  return "User";
}

export function formatStatus(status) {
  const normalized = String(status || "draft");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
