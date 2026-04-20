import {
  authenticateUser,
  clearSession,
  createPendingSignup,
  formatRole,
  getPendingSignupByEmail,
  initializeAppData,
  setSession
} from "./data.js";

initializeAppData();

const page = document.body.dataset.page;

if (page === "signup") setupSignup();
if (page === "login") setupLogin();

function setMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function getSignupRole() {
  const params = new URLSearchParams(window.location.search);
  return params.get("role") === "admin" ? "admin" : "user";
}

function getLoginRole() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("portal") === "superadmin") return "superadmin";
  return params.get("role") === "admin" ? "admin" : "user";
}

function redirectByRole(user) {
  localStorage.setItem("userEmail", user.email || "");
  localStorage.setItem("userRole", user.role);
  setSession(user);

  if (user.role === "superadmin") {
    window.location.href = "./superadmin.html";
    return;
  }

  if (user.role === "admin") {
    window.location.href = "./admin.html";
    return;
  }

  window.location.href = "./join.html";
}

function setupSignup() {
  const form = document.getElementById("signupForm");
  const message = document.getElementById("signupMessage");
  const title = document.getElementById("signupTitle");
  const eyebrow = document.getElementById("signupEyebrow");
  const intro = document.getElementById("signupIntro");
  const submitButton = document.getElementById("signupSubmitBtn");
  const flowSummaryTitle = document.getElementById("signupFlowSummaryTitle");
  const flowSummaryBody = document.getElementById("signupFlowSummaryBody");
  const roleBadge = document.getElementById("signupRoleBadge");
  const switchLink = document.getElementById("signupSwitchLink");
  const role = getSignupRole();

  if (eyebrow) eyebrow.textContent = role === "admin" ? "Admin registration" : "Create access";
  if (title) title.textContent = role === "admin" ? "Request admin access" : "Create your user account";
  if (intro) {
    intro.textContent = role === "admin"
      ? "Enter your name, email, and password. Your registration request will be reviewed by the super admin."
      : "Enter your name, email, and password to create your account. Login only needs your email and password.";
  }
  if (submitButton) submitButton.textContent = role === "admin" ? "Send Admin Request" : "Sign up";
  if (flowSummaryTitle) flowSummaryTitle.textContent = role === "admin" ? "Admin approval flow" : "User signup flow";
  if (flowSummaryBody) {
    flowSummaryBody.textContent = role === "admin"
      ? "The super admin can approve or reject your admin request from the portal."
      : "Create your account once, then log in directly with the same email and password.";
  }
  if (roleBadge) roleBadge.textContent = formatRole(role);
  if (switchLink) {
    switchLink.href = role === "admin" ? "./signup.html?role=user" : "./signup.html?role=admin";
    switchLink.textContent = role === "admin" ? "Create a user account instead" : "Need admin access instead?";
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim().toLowerCase();
    const password = document.getElementById("signupPassword").value;

    if (!name || !email || !password) {
      setMessage(message, "Please complete all required fields.", true);
      return;
    }

    if (password.length < 6) {
      setMessage(message, "Password must be at least 6 characters long.", true);
      return;
    }

    setMessage(message, role === "admin" ? "Submitting admin request..." : "Creating account...");
    const { error } = await createPendingSignup({ name, email, password, role });

    if (error) {
      setMessage(message, error, true);
      return;
    }

    if (role === "admin") {
      setMessage(message, "Admin request submitted successfully. Wait for super admin approval before logging in.");
      return;
    }

    setMessage(message, "Account created successfully. Redirecting to login...");
    window.location.href = "./login.html?role=user";
  });
}

function setupLogin() {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("authMessage");
  const title = document.getElementById("loginTitle");
  const intro = document.getElementById("loginIntro");
  const helper = document.getElementById("loginHelper");
  const roleInput = document.getElementById("loginRole");
  const roleTabs = [...document.querySelectorAll(".role-toggle")];
  const portalRole = getLoginRole();
  const roleTabsWrapper = document.getElementById("roleTabs");
  const authLinks = document.getElementById("loginAuxLinks");

  if (portalRole === "superadmin") {
    if (title) title.textContent = "Super admin login";
    if (intro) intro.textContent = "Login to manage local admin requests and active admins.";
    if (helper) helper.textContent = "Use priyanshubrar55@gmail.com / admin@780 to approve, reject, or remove admins.";
    roleTabsWrapper?.classList.add("hidden-block");
    authLinks?.classList.add("hidden-block");
  }

  if (roleInput) roleInput.value = portalRole;

  roleTabs.forEach((tab) => {
    const shouldActivate = tab.dataset.role === portalRole;
    tab.classList.toggle("active", shouldActivate);

    tab.addEventListener("click", () => {
      roleTabs.forEach((entry) => entry.classList.remove("active"));
      tab.classList.add("active");
      roleInput.value = tab.dataset.role;
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const selectedRole = roleInput?.value || "user";

    if (!email || !password) {
      setMessage(message, "Please enter your email and password.", true);
      return;
    }

    setMessage(message, "Signing in...");
    const { user, error } = await authenticateUser(email, password);
    const pendingSignup = selectedRole === "admin" ? await getPendingSignupByEmail(email) : null;

    if (error || !user) {
      if (pendingSignup?.role === "admin" && pendingSignup.status === "pending") {
        setMessage(message, "Your admin request is still pending super admin approval.", true);
        return;
      }
      if (pendingSignup?.status === "rejected") {
        setMessage(message, "Your admin request was rejected by the super admin.", true);
        return;
      }

      setMessage(message, error || "Invalid email or password.", true);
      return;
    }

    if (user.role !== selectedRole) {
      await clearSession();
      if (selectedRole === "admin" && pendingSignup?.status === "pending") {
        setMessage(message, "Your admin request is still pending super admin approval.", true);
        return;
      }
      if (selectedRole === "admin" && pendingSignup?.status === "rejected") {
        setMessage(message, "Your admin request was rejected by the super admin.", true);
        return;
      }
      setMessage(message, `This account is registered as ${formatRole(user.role)}. Choose the matching login option.`, true);
      return;
    }

    setMessage(message, "Login successful. Redirecting...");
    redirectByRole(user);
  });
}
