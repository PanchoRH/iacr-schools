(() => {
  const form = document.getElementById("schoolProposalForm");
  if (!form) return;

  const key = "iacr-school-proposal-draft-v1";
  const status = document.getElementById("draftStatus");
  const note = document.getElementById("submissionNote");
  const saveButton = document.getElementById("saveDraft");
  const downloadButton = document.getElementById("downloadDraft");
  let saveTimer;

  const serialize = () => {
    const data = Object.fromEntries(new FormData(form).entries());
    data.confirmation = form.elements.confirmation.checked;
    data.saved_at = new Date().toISOString();
    return data;
  };

  const fill = data => {
    Object.entries(data || {}).forEach(([name, value]) => {
      const field = form.elements[name];
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value ?? "";
    });
  };

  const save = () => {
    localStorage.setItem(key, JSON.stringify(serialize()));
    status.textContent = "Draft saved locally.";
  };

  const restore = () => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      fill(data);
      status.textContent = "Local draft restored.";
    } catch {
      status.textContent = "Could not restore the local draft.";
    }
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  };

  form.addEventListener("input", scheduleSave);
  form.addEventListener("change", scheduleSave);
  saveButton.addEventListener("click", save);

  downloadButton.addEventListener("click", () => {
    const data = serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (data.school_name || "iacr-school-proposal").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    link.href = url;
    link.download = (safeName || "iacr-school-proposal") + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    note.className = "form-note";

    if (!form.reportValidity()) return;

    const endpoint = form.dataset.endpoint.trim();
    if (!endpoint) {
      save();
      note.textContent = "Online submission is not connected yet. Your draft remains saved locally.";
      note.classList.add("error");
      return;
    }

    const submitButton = document.getElementById("submitProposal");
    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";

    try {
      const response = await fetch(endpoint, {
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify(serialize())
      });

      if (!response.ok) throw new Error("Submission failed");

      localStorage.removeItem(key);
      form.reset();
      status.textContent = "No local draft.";
      note.textContent = "Proposal submitted.";
      note.classList.add("success");
    } catch {
      note.textContent = "Submission failed. Your local draft is still available.";
      note.classList.add("error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit proposal";
    }
  });

  restore();
})();