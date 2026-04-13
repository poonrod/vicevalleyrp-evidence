const hud = document.getElementById("hud");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const line3 = document.getElementById("line3");
const player = document.getElementById("player");
const config = document.getElementById("config");

window.addEventListener("message", (e) => {
  const d = e.data;
  if (d.type === "bodycam_state") {
    if (d.active) hud.classList.remove("hidden");
    else hud.classList.add("hidden");
  }
  if (d.type === "hud_tick") {
    line1.textContent = `${d.officer} • ${d.dept} • Badge ${d.badge}`;
    line2.textContent = `${d.time} • ${d.street || ""}`;
    line3.textContent = `INC ${d.incident || "—"}${d.auto ? " • AUTO" : ""}${d.sleeping ? " • SLEEP" : ""}${!d.equipped ? " • NO EQUIP" : ""}`;
  }
  if (d.type === "play_sound") {
    try {
      player.src = `sounds/${d.file}`;
      player.volume = typeof d.volume === "number" ? d.volume : 0.35;
      player.play().catch(() => {});
    } catch {
      /* missing file */
    }
  }
  if (d.type === "config_open") {
    config.classList.remove("hidden");
    document.getElementById("sleeping").checked = !!d.sleeping;
    document.getElementById("autoTaser").checked = !!d.autoTaser;
    document.getElementById("autoFirearm").checked = !!d.autoFirearm;
    document.getElementById("sound").checked = !!d.sound;
    document.getElementById("firstPerson").checked = !!d.firstPerson;
    document.getElementById("lowStorage").checked = !!d.lowStorage;
    document.getElementById("autoTaser").disabled = !!d.lockedTaser;
    document.getElementById("autoFirearm").disabled = !!d.lockedFirearm;
    document.getElementById("status").textContent = `Job: ${d.job || "?"} • Equipped: ${d.equipped ? "Yes" : "No"} • BCAM: ${d.bodycamActive ? "On" : "Off"}`;
  }
});

function resourceName() {
  return typeof GetParentResourceName === "function" ? GetParentResourceName() : "vicevalley_bodycam";
}

function post(name, data) {
  fetch(`https://${resourceName()}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
}

document.getElementById("close").addEventListener("click", () => {
  post("bcamconfig_close", {});
  config.classList.add("hidden");
});

document.getElementById("save").addEventListener("click", () => {
  post("bcamconfig_apply", {
    sleeping: document.getElementById("sleeping").checked,
    autoTaser: document.getElementById("autoTaser").checked,
    autoFirearm: document.getElementById("autoFirearm").checked,
    sound: document.getElementById("sound").checked,
    firstPerson: document.getElementById("firstPerson").checked,
    lowStorage: document.getElementById("lowStorage").checked,
  });
  config.classList.add("hidden");
});
