async function run() {
  const tokenRes = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" }
  });
  const { access_token } = await tokenRes.json();

  const baseUrl = "https://firestore.googleapis.com/v1/projects/trusty-coder-386311/databases/ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c/documents";

  async function get(path) {
    const res = await fetch(`${baseUrl}/${path}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return res.json();
  }

  console.log("=== LISTING FAMILIES ===");
  const families = await get("families");
  console.log("Families docs:", families.documents ? families.documents.length : 0);
  for (const doc of families.documents || []) {
    const famId = doc.name.split("/").pop();
    console.log("Family ID:", famId, JSON.stringify(doc.fields));

    // List familyTasks
    try {
      const fts = await get(`families/${famId}/familyTasks`);
      console.log(`\nFamilyTasks for ${famId}: ${(fts.documents || []).length}`);
      for (const ft of fts.documents || []) {
        const ftId = ft.name.split("/").pop();
        console.log(`  FT: ${ftId}`, JSON.stringify(ft.fields));
      }
    } catch (e) {
      console.log(`  Error fetching familyTasks for ${famId}:`, e.message);
    }

    // List assignments
    try {
      const asgs = await get(`families/${famId}/assignments`);
      console.log(`\nAssignments for ${famId}: ${(asgs.documents || []).length}`);
      for (const asg of asgs.documents || []) {
        const asgId = asg.name.split("/").pop();
        console.log(`  ASG: ${asgId}`, JSON.stringify(asg.fields));
      }
    } catch (e) {
      console.log(`  Error fetching assignments for ${famId}:`, e.message);
    }
  }

  // Also check familyMemberships
  try {
    const mems = await get("familyMemberships");
    console.log(`\n=== MEMBERSHIPS (${(mems.documents || []).length}) ===`);
    for (const m of mems.documents || []) {
      const mId = m.name.split("/").pop();
      console.log(`  Mem: ${mId}`, JSON.stringify(m.fields));
    }
  } catch (e) {
    console.log("Error fetching memberships:", e.message);
  }
}

run().catch(console.error);
