const box = document.getElementById("enabled");
chrome.storage.sync.get({ enabled: true }, ({ enabled }) => (box.checked = enabled));
box.addEventListener("change", () => chrome.storage.sync.set({ enabled: box.checked }));
const d = window.COLLEGE_DATA;
if (d) document.getElementById("meta").textContent = `${d.schools.length} U.S. schools · College Scorecard data ${d.generated}`;
