import { getLeaderboard, initializeAppData } from "./data.js";

initializeAppData();

const tableBody = document.getElementById("leaderboardBody");
const params = new URLSearchParams(window.location.search);
const quizId = params.get("quiz");

if (!tableBody) {
  throw new Error("Leaderboard table body missing.");
}

if (!quizId) {
  tableBody.innerHTML = `<tr><td colspan="3">Invalid quiz link</td></tr>`;
  throw new Error("quizId missing");
}

const leaderboard = await getLeaderboard(quizId);
tableBody.innerHTML = leaderboard.length
  ? leaderboard.map((row) => `
    <tr>
      <td>${row.rank}</td>
      <td>${row.full_name}</td>
      <td>${row.score}</td>
    </tr>
  `).join("")
  : `<tr><td colspan="3">No results yet</td></tr>`;
