const fs = require('fs');

const h = fs.readFileSync('src/lib/attendance/firestoreHelpers.ts', 'utf8');
const hLines = h.split('\n');
for (let i = 28; i < 45; i++) {
  console.log('H' + (i+1) + ': ' + hLines[i]);
}

console.log('---');

const s = fs.readFileSync('src/lib/attendance/statusHelpers.ts', 'utf8');
const sLines = s.split('\n');
for (let i = 248; i < 256; i++) {
  console.log('S' + (i+1) + ': ' + sLines[i]);
  const fs = require('fs');

  const h = fs.readFileSync('src/lib/attendance/firestoreHelpers.ts', 'utf8');
  const hLines = h.split('\n');
  for (let i = 28; i < 45; i++) {
    console.log('H' + (i+1) + ': ' + hLines[i]);
  }
  
  console.log('---');
  
  const s = fs.readFileSync('src/lib/attendance/statusHelpers.ts', 'utf8');
  const sLines = s.split('\n');
  for (let i = 248; i < 256; i++) {
    console.log('S' + (i+1) + ': ' + sLines[i]);
  }