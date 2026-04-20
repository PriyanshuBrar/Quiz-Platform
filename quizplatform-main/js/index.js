import { getSession, initializeAppData } from "./data.js";

initializeAppData();

document.addEventListener("DOMContentLoaded", async () => {
  const session = await getSession();
  const createBtn = document.getElementById("createBtn");
  const joinBtn = document.getElementById("joinBtn");

  createBtn?.addEventListener("click", () => {
    window.location.href = session?.role === "admin" ? "admin.html" : "login.html?role=admin";
  });

  joinBtn?.addEventListener("click", () => {
    window.location.href = session ? "join.html" : "login.html?role=user";
  });
});
