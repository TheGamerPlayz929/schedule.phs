const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const dir=path.join(__dirname,'..');
const r=require(path.join(dir,'schedule-resolver.js')),data=require(path.join(dir,'data.json'));
const settings={officialSchedule:data._calendar};
const resolve=iso=>r.resolveScheduleType(iso,settings,r.baseScheduleEntry(iso,data)[0]).type;
for(const [iso,type] of Object.entries({'2026-08-24':'No School','2026-08-25':'Normal Schedule','2026-09-05':'No School','2026-09-07':'No School','2026-09-09':'Advisory','2026-09-18':'Early Release','2026-09-21':'No School','2026-09-23':'Advisory','2026-12-23':'Early Release','2026-12-24':'No School','2027-01-04':'Normal Schedule','2027-03-26':'No School','2027-04-05':'Normal Schedule','2027-04-22':'No School','2027-05-17':'No School','2027-06-11':'Early Release','2027-06-14':'No School','2027-09-18':'No School'})) assert.equal(resolve(iso),type,iso);
let instructional=0,early=0;
for(let d=new Date(2026,7,25);d<=new Date(2027,5,11);d.setDate(d.getDate()+1)) { const type=resolve(r.toISODate(d));if(type!=='No School')instructional++;if(type==='Early Release')early++; }
assert.equal(instructional,181);assert.equal(early,7);
assert.equal(r.resolveScheduleType('2026-09-18',{...settings,bellSchedules:{_dateOverrides:{'2026-09-18':'Assembly'}}}).type,'Assembly');
assert.equal(r.resolveScheduleType('2026-09-21',{...settings,scheduleOverride:{date:'2026-09-21',type:'Delayed Opening'}}).type,'Delayed Opening');
const legacyData=Object.fromEntries(Object.entries(data).filter(([key])=>!key.startsWith('_')));
assert.equal(r.baseScheduleEntry('2026-09-05',legacyData,data._calendar)[0],'No School');
assert.equal(r.baseScheduleEntry('2026-09-09',legacyData,data._calendar)[0],'Advisory');
assert.deepEqual(data._templates['Early Release']['41220'],[43080,'Lunch']);
assert.deepEqual(data._templates.Advisory['33600'],[36000,'Homeroom']);
for(const name of ['main.js','schedule-resolver.js','settings-loader.js','data.json'])assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),fs.readFileSync(path.join(dir,'public',name),'utf8'),name);
console.log(JSON.stringify({instructionalDays:instructional,earlyReleaseDays:early,checks:'18 dates, precedence, bell times and public/admin parity passed'}));
