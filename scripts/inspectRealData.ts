import { db } from '../src/infrastructure/firebase/firebaseConfig';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

async function inspect() {
  console.log('--- INSPECTING FIRESTORE ---');
  try {
    const familiesSnap = await getDocs(collection(db, 'families'));
    console.log(`Found ${familiesSnap.size} families:`);
    for (const fDoc of familiesSnap.docs) {
      console.log(`Family: ${fDoc.id}`, fDoc.data());

      // Check familyTasks
      const ftSnap = await getDocs(collection(db, 'families', fDoc.id, 'familyTasks'));
      console.log(`  FamilyTasks count: ${ftSnap.size}`);
      ftSnap.forEach(ft => {
        const d = ft.data();
        console.log(`  FT: id=${ft.id}, name=${d.name || d.customTitle}, target=${d.executionTarget}, support=${d.domesticSupportId}, active=${d.active}, freq=${d.frequency}, days=${JSON.stringify(d.preferred_days || d.preferredDays)}, start=${d.start_date || d.startDate}, created=${d.created_at || d.createdAt}`);
      });

      // Check assignments
      const asgSnap = await getDocs(collection(db, 'families', fDoc.id, 'assignments'));
      console.log(`  Assignments count: ${asgSnap.size}`);
      asgSnap.forEach(asg => {
        const d = asg.data();
        console.log(`  ASG: id=${asg.id}, ft_id=${d.family_task_id || d.familyTaskId}, date=${d.scheduled_date || d.scheduledDate}, status=${d.status}, member=${d.member_id}`);
      });
    }
  } catch (err) {
    console.error('Error inspecting Firestore:', err);
  }
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
