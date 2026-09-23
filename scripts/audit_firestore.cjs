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
    else if (v.arrayValue !== undefined) res[k] = (v.arrayValue.values || []).map(val => val.stringValue || val.integerValue || val);
    else res[k] = v;
  }
  return res;
}

async function run() {
  const token = await getAccessToken();
  console.log('=== AUDITORIA FIRESTORE (READ-ONLY) ===\n');

  // 1. Families
  console.log('--- FAMILIES ---');
  const families = await firestoreGet('families', token);
  if (families.documents) {
    for (const doc of families.documents) {
      const id = doc.name.split('/').pop();
      const data = parseFirestoreFields(doc.fields);
      console.log(`Family ID: ${id}`);
      console.log('Data:', JSON.stringify(data, null, 2));

      // Members subcollection
      const members = await firestoreGet(`families/${id}/members`, token);
      console.log(`Members count for ${id}:`, members.documents ? members.documents.length : 0);
      if (members.documents) {
        members.documents.forEach(mDoc => {
          const mId = mDoc.name.split('/').pop();
          console.log(`  Member ID: ${mId}`, JSON.stringify(parseFirestoreFields(mDoc.fields)));
        });
      }
    }
  } else {
    console.log('No families found or error:', families);
  }

  // 2. Family Memberships
  console.log('\n--- FAMILY MEMBERSHIPS ---');
  const memberships = await firestoreGet('familyMemberships', token);
  if (memberships.documents) {
    for (const doc of memberships.documents) {
      const id = doc.name.split('/').pop();
      const data = parseFirestoreFields(doc.fields);
      console.log(`Membership ID: ${id}`);
      console.log('Data:', JSON.stringify(data, null, 2));
    }
  } else {
    console.log('No memberships found or error:', memberships);
  }

  // 3. Users
  console.log('\n--- USERS ---');
  const users = await firestoreGet('users', token);
  if (users.documents) {
    for (const doc of users.documents) {
      const id = doc.name.split('/').pop();
      const data = parseFirestoreFields(doc.fields);
      console.log(`User ID: ${id}`);
      console.log('Data:', JSON.stringify(data, null, 2));
    }
  } else {
    console.log('No users found or error:', users);
  }
}

run().catch(console.error);
