import fs from 'fs';
const file = './data/rgu_intents.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const tagsToRemove = [
  "available_programmes",
  "mba_courses",
  "btech_courses",
  "bsc_courses",
  "bca_courses",
  "bba_courses",
  "programmes_details",
  "course_comparison",
  "r_smart_specializations"
];

data.intents = data.intents.filter(intent => !tagsToRemove.includes(intent.tag));

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("Removed hardcoded course intents!");
