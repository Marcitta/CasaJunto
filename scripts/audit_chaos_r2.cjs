const http = require('http');
const https = require('https');

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data).access_token));
    });
    req.on('error', reject);
  });
}

async function firestoreGet(path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/trusty-coder-386311/databases/ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c/documents/${path}`;
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    }).on('error', reject);
  });
}

function parseFirestoreFields(fields) {
  if (!fields) return {};
  const res = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) res[k] = v.stringValue;
    else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
    else if (v.integerValue !== undefined) res[k] = parseInt(v.integerValue, 10);
    else if (v.doubleValue !== undefined) res[k] = parseFloat(v.doubleValue);
    else if (v.timestampValue !== undefined) res[k] = v.timestampValue;
    else if (v.nullValue !== undefined) res[k] = null;
    else if (v.mapValue !== undefined) res[k] = parseFirestoreFields(v.mapValue.fields);
    else if (v.arrayValue !== undefined) {
      res[k] = (v.arrayValue.values || []).map(val => {
        if (val.stringValue !== undefined) return val.stringValue;
        if (val.mapValue !== undefined) return parseFirestoreFields(val.mapValue.fields);
        return val;
      });
    }
    else res[k] = v;
  }
  return res;
}

async function run() {
  const token = await getAccessToken();
  const familyId = 'fam-croce-2026';
  console.log(`=== AUDIT REAL DATA FOR ${familyId} ===\n`);

  // 1. Members
  console.log('--- MEMBERS ---');
  const members = await firestoreGet(`families/${familyId}/members`, token);
  if (members.documents) {
    for (const doc of members.documents) {
      const id = doc.name.split('/').pop();
      console.log(`Member [${id}]:`, JSON.stringify(parseFirestoreFields(doc.fields)));
    }
  }

  // 2. Family Tasks (especially "testes caos")
  console.log('\n--- FAMILY TASKS ---');
  const fts = await firestoreGet(`families/${familyId}/family_tasks`, token);
  if (fts.documents) {
    for (const doc of fts.documents) {
      const id = doc.name.split('/').pop();
      const data = parseFirestoreFields(doc.fields);
      if ((data.name && data.name.toLowerCase().includes('caos')) ||
          (data.customTitle && data.customTitle.toLowerCase().includes('caos'))) {
        console.log(`FamilyTask [${id}]:`, JSON.stringify(data));
      }
    }
  }

  // 3. Task Assignments
  console.log('\n--- TASK ASSIGNMENTS ---');
  const asgs = await firestoreGet(`families/${familyId}/task_assignments`, token);
  if (asgs.documents) {
    for (const doc of asgs.documents) {
      const id = doc.name.split('/').pop();
      const data = parseFirestoreFields(doc.fields);
      console.log(`Assignment [${id}]:`, JSON.stringify(data));
    }
  }

  // Also check assignments collection if any
  const oldAsgs = await firestoreGet(`families/${familyId}/assignments`, token);
  if (oldAsgs.documents) {
    console.log(`Old assignments collection count: ${oldAsgs.documents.length}`);
    for (const doc of oldAsgs.documents) {
      const id = doc.name.split('/').pop();
      console.log(`Old Assignment [${id}]:`, JSON.stringify(parseFirestoreFields(doc.fields)));
    }
  }

  // 4. Chaos Sessions
  console.log('\n--- CHAOS SESSIONS ---');
  const cs = await firestoreGet(`families/${familyId}/chaos_sessions`, token);
  if (cs.documents) {
    for (const doc of cs.documents) {
      const id = doc.name.split('/').pop();
      console.log(`ChaosSession [${id}]:`, JSON.stringify(parseFirestoreFields(doc.fields)));
    }
  } else {
    console.log('No chaos sessions found:', cs);
  }

  // 5. Chaos State Current
  console.log('\n--- CHAOS STATE CURRENT ---');
  const state = await firestoreGet(`families/${familyId}/chaosState/current`, token);
  console.log('chaosState/current:', JSON.stringify(state.fields ? parseFirestoreFields(state.fields) : state));
}

run().catch(console.error);
